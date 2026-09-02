const checkoutScriptUrl = "https://checkout.razorpay.com/v1/checkout.js";
const checkoutScriptSelector = 'script[data-opspilot-checkout="razorpay"]';
const checkoutScriptTimeoutMs = 15_000;

function loadCheckoutScript(scriptUrl) {
  if (window.Razorpay) return Promise.resolve();
  if (scriptUrl !== checkoutScriptUrl) {
    return Promise.reject(new Error("Checkout script is invalid."));
  }

  return new Promise((resolve, reject) => {
    let script = document.querySelector(checkoutScriptSelector);
    if (script?.dataset.opspilotCheckoutState === "loaded") {
      script.remove();
      script = null;
    }

    const isNewScript = !script;
    script ??= document.createElement("script");
    if (isNewScript) {
      script.src = checkoutScriptUrl;
      script.async = true;
      script.dataset.opspilotCheckout = "razorpay";
      script.dataset.opspilotCheckoutState = "loading";
    }

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      finish(reject, new Error("Secure checkout loading timed out."), { removeScript: true });
    }, checkoutScriptTimeoutMs);

    function cleanup() {
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    }

    function finish(callback, value, { removeScript = false } = {}) {
      if (settled) return;
      settled = true;
      cleanup();
      if (removeScript) script.remove();
      callback(value);
    }

    function onLoad() {
      script.dataset.opspilotCheckoutState = "loaded";
      if (window.Razorpay) finish(resolve);
      else
        finish(reject, new Error("Secure checkout did not initialize."), {
          removeScript: true,
        });
    }

    function onError() {
      finish(reject, new Error("Secure checkout could not load."), { removeScript: true });
    }

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (isNewScript) document.head.append(script);
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
