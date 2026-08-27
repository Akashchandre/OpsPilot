const checkoutScriptUrl = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckoutScript(scriptUrl) {
  if (window.Razorpay) return Promise.resolve();
  if (scriptUrl !== checkoutScriptUrl) {
    return Promise.reject(new Error("Checkout script is invalid."));
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-opspilot-checkout="razorpay"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Secure checkout could not load.")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = checkoutScriptUrl;
    script.async = true;
    script.dataset.opspilotCheckout = "razorpay";
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error("Secure checkout could not load.")), {
      once: true,
    });
    document.head.append(script);
  });
}

export async function openRazorpayCheckout(
  { order, checkout },
  { onResult, onDismiss, onFailure },
) {
  await loadCheckoutScript(checkout.scriptUrl);
  if (!window.Razorpay) throw new Error("Secure checkout did not initialize.");

  const modal = new window.Razorpay({
    key: checkout.keyId,
    amount: checkout.amountSubunits,
    currency: checkout.currency,
    order_id: checkout.providerOrderId,
    name: "OpsPilot",
    description: `Order ${order.orderNumber}`,
    timeout: checkout.timeoutSeconds,
    retry: { enabled: true },
    handler: onResult,
    modal: { ondismiss: onDismiss },
  });
  if (typeof modal.on === "function") modal.on("payment.failed", onFailure);
  modal.open();
}
