export class RazorpayProviderError extends Error {
  constructor({ code, statusCode = 503, retriable = false, ambiguous = false }) {
    super("The payment provider request could not be completed");
    this.name = "RazorpayProviderError";
    this.code = code;
    this.statusCode = statusCode;
    this.retriable = retriable;
    this.ambiguous = ambiguous;
  }
}

function responseError(status, method) {
  if (status === 401 || status === 403) {
    return new RazorpayProviderError({
      code: "PAYMENT_PROVIDER_AUTHENTICATION_FAILED",
      statusCode: 503,
    });
  }
  if (status === 408) {
    return new RazorpayProviderError({
      code: "PAYMENT_PROVIDER_TIMEOUT",
      statusCode: 503,
      retriable: true,
      ambiguous: method !== "GET",
    });
  }
  if (status === 409 && method !== "GET") {
    return new RazorpayProviderError({
      code: "PAYMENT_PROVIDER_REQUEST_IN_PROGRESS",
      statusCode: 503,
      retriable: true,
      ambiguous: true,
    });
  }
  if (status === 429) {
    return new RazorpayProviderError({
      code: "PAYMENT_PROVIDER_RATE_LIMITED",
      statusCode: 503,
      retriable: true,
    });
  }
  if (status >= 500) {
    return new RazorpayProviderError({
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
      statusCode: 503,
      retriable: true,
      ambiguous: method !== "GET",
    });
  }
  return new RazorpayProviderError({
    code: "PAYMENT_PROVIDER_REQUEST_REJECTED",
    statusCode: 502,
  });
}

export function createRazorpayAdapter(config, { fetchImpl = globalThis.fetch } = {}) {
  const providerConfig = config.payments.razorpay;
  const authorization = providerConfig.enabled
    ? `Basic ${Buffer.from(`${providerConfig.keyId}:${providerConfig.keySecret}`).toString("base64")}`
    : undefined;

  async function request(path, { method = "GET", body, headers = {} } = {}) {
    if (!providerConfig.enabled) {
      throw new RazorpayProviderError({
        code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
        statusCode: 503,
      });
    }

    let response;
    try {
      response = await fetchImpl(`${providerConfig.apiBaseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: authorization,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(providerConfig.requestTimeoutMs),
      });
    } catch {
      throw new RazorpayProviderError({
        code: "PAYMENT_PROVIDER_TIMEOUT",
        statusCode: 503,
        retriable: true,
        ambiguous: method !== "GET",
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new RazorpayProviderError({
        code: "PAYMENT_PROVIDER_INVALID_RESPONSE",
        statusCode: 502,
        retriable: response.status >= 500,
        ambiguous: method !== "GET" && response.status >= 500,
      });
    }

    if (!response.ok) throw responseError(response.status, method);
    return payload;
  }

  return Object.freeze({
    name: "RAZORPAY",
    enabled: providerConfig.enabled,
    keyId: providerConfig.keyId,
    checkoutScriptUrl: providerConfig.checkoutScriptUrl,

    createOrder({ amountSubunits, currency, receipt }) {
      return request("/orders", {
        method: "POST",
        body: { amount: amountSubunits, currency, receipt, partial_payment: false },
      });
    },

    async findOrderByReceipt(receipt) {
      const payload = await request(`/orders?receipt=${encodeURIComponent(receipt)}&count=2`);
      const matches = Array.isArray(payload.items)
        ? payload.items.filter((order) => order.receipt === receipt)
        : [];
      if (matches.length > 1) {
        throw new RazorpayProviderError({
          code: "PAYMENT_PROVIDER_DUPLICATE_RECEIPT",
          statusCode: 502,
        });
      }
      return matches[0] ?? null;
    },

    fetchOrder(providerOrderId) {
      return request(`/orders/${encodeURIComponent(providerOrderId)}`);
    },

    fetchPaymentsForOrder(providerOrderId) {
      return request(`/orders/${encodeURIComponent(providerOrderId)}/payments`);
    },

    fetchPayment(providerPaymentId) {
      return request(`/payments/${encodeURIComponent(providerPaymentId)}`);
    },

    createRefund(providerPaymentId, { amountSubunits, idempotencyKey }) {
      return request(`/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
        method: "POST",
        headers: { "X-Refund-Idempotency": idempotencyKey },
        body: { amount: amountSubunits },
      });
    },

    fetchRefund(providerRefundId) {
      return request(`/refunds/${encodeURIComponent(providerRefundId)}`);
    },
  });
}
