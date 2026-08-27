import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { confirmPayment, createOrder, getCart, getPaymentSession } from "../api/commerce.js";
import { Money } from "../components/Money.jsx";
import { openRazorpayCheckout } from "../payments/razorpayCheckout.js";

function newIdempotencyKey() {
  return crypto.randomUUID();
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const idempotencyKey = useRef(null);
  const [cartState, setCartState] = useState({ status: "loading", cart: null, error: "" });
  const [paymentState, setPaymentState] = useState({
    status: "idle",
    order: null,
    error: "",
    providerCode: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    getCart({ signal: controller.signal })
      .then((cart) => setCartState({ status: "ready", cart, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setCartState({ status: "error", cart: null, error: error.message });
        }
      });
    return () => controller.abort();
  }, []);

  async function launchCheckout(result) {
    setPaymentState({
      status: result.checkout ? "loading-checkout" : "pending",
      order: result.order,
      error: "",
      providerCode: result.providerCode,
    });
    if (!result.checkout) return;

    try {
      await openRazorpayCheckout(result, {
        onResult: async (providerResult) => {
          setPaymentState((current) => ({ ...current, status: "confirming", error: "" }));
          try {
            const confirmation = await confirmPayment({
              orderId: result.order.id,
              providerOrderId: providerResult.razorpay_order_id,
              providerPaymentId: providerResult.razorpay_payment_id,
              signature: providerResult.razorpay_signature,
            });
            idempotencyKey.current = null;
            if (confirmation.confirmationPending) {
              setPaymentState({
                status: "pending",
                order: confirmation.order,
                error: "Payment confirmation is pending. You can safely check the order again.",
                providerCode: confirmation.providerCode,
              });
            } else {
              navigate(`/orders/${result.order.id}`, { replace: true });
            }
          } catch (error) {
            setPaymentState((current) => ({
              ...current,
              status: "pending",
              error: error.message,
            }));
          }
        },
        onDismiss() {
          setPaymentState((current) => ({
            ...current,
            status: "pending",
            error: "Checkout was closed. Your order remains payable until its reservation expires.",
          }));
        },
        onFailure() {
          setPaymentState((current) => ({
            ...current,
            status: "pending",
            error: "Payment was not completed. You may retry while the reservation is active.",
          }));
        },
      });
      setPaymentState((current) => ({ ...current, status: "checkout-open" }));
    } catch (error) {
      setPaymentState((current) => ({ ...current, status: "pending", error: error.message }));
    }
  }

  async function submitCheckout(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const shippingAddress = Object.fromEntries(
      ["recipientName", "phone", "addressLine1", "addressLine2", "city", "state", "postalCode"].map(
        (field) => [field, String(form.get(field) ?? "").trim()],
      ),
    );
    if (!shippingAddress.addressLine2) delete shippingAddress.addressLine2;
    shippingAddress.countryCode = "IN";

    setPaymentState({ status: "creating", order: null, error: "", providerCode: null });
    try {
      idempotencyKey.current ??= newIdempotencyKey();
      const result = await createOrder(
        { cartVersion: cartState.cart.version, shippingAddress },
        idempotencyKey.current,
      );
      await launchCheckout(result);
    } catch (error) {
      setPaymentState({ status: "idle", order: null, error: error.message, providerCode: null });
    }
  }

  async function resumePayment() {
    setPaymentState((current) => ({ ...current, status: "loading-checkout", error: "" }));
    try {
      await launchCheckout(await getPaymentSession(paymentState.order.id));
    } catch (error) {
      setPaymentState((current) => ({ ...current, status: "pending", error: error.message }));
    }
  }

  if (cartState.status === "loading") return <p role="status">Loading checkout...</p>;
  if (!cartState.cart) {
    return (
      <section className="panel route-state" role="alert">
        <h1>Checkout unavailable</h1>
        <p>{cartState.error}</p>
      </section>
    );
  }
  const cart = cartState.cart;
  if (cart.items.length === 0 && !paymentState.order) {
    return (
      <section className="panel empty-state">
        <h1>Your cart is empty</h1>
        <Link className="button button--primary" to="/products">
          Browse products
        </Link>
      </section>
    );
  }

  return (
    <section className="commerce-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SECURE CHECKOUT</p>
          <h1>Shipping and payment</h1>
          <p className="muted">India shipping · INR · tax and shipping currently ₹0.00</p>
        </div>
        <strong className="price">
          <Money amount={cart.subtotal} currency={cart.currency} />
        </strong>
      </div>
      {paymentState.error ? (
        <p className="global-alert" role="alert">
          {paymentState.error}
        </p>
      ) : null}

      {paymentState.order ? (
        <div className="panel checkout-pending">
          <p className="eyebrow">ORDER CREATED</p>
          <h2>{paymentState.order.orderNumber}</h2>
          <p>
            Status: <strong>{paymentState.order.status}</strong>
          </p>
          <p className="muted">Only server-verified provider state marks an order as paid.</p>
          <div className="commerce-actions">
            <button
              className="button button--primary"
              type="button"
              onClick={resumePayment}
              disabled={paymentState.status === "loading-checkout"}
            >
              Retry secure payment
            </button>
            <Link className="button button--quiet" to={`/orders/${paymentState.order.id}`}>
              View order
            </Link>
          </div>
        </div>
      ) : (
        <form className="panel checkout-form" onSubmit={submitCheckout}>
          <h2>Shipping address</h2>
          <div className="form-row">
            <label>
              <span>Recipient name</span>
              <input
                name="recipientName"
                required
                minLength="2"
                maxLength="100"
                autoComplete="name"
              />
            </label>
            <label>
              <span>Phone</span>
              <input name="phone" required maxLength="16" autoComplete="tel" />
            </label>
          </div>
          <label>
            <span>Address line 1</span>
            <input
              name="addressLine1"
              required
              minLength="3"
              maxLength="200"
              autoComplete="address-line1"
            />
          </label>
          <label>
            <span>Address line 2 (optional)</span>
            <input name="addressLine2" maxLength="200" autoComplete="address-line2" />
          </label>
          <div className="form-row">
            <label>
              <span>City</span>
              <input
                name="city"
                required
                minLength="2"
                maxLength="100"
                autoComplete="address-level2"
              />
            </label>
            <label>
              <span>State</span>
              <input
                name="state"
                required
                minLength="2"
                maxLength="100"
                autoComplete="address-level1"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Postal code</span>
              <input
                name="postalCode"
                required
                pattern="[0-9]{6}"
                inputMode="numeric"
                autoComplete="postal-code"
              />
            </label>
            <label>
              <span>Country</span>
              <input value="India" readOnly />
            </label>
          </div>
          <div className="checkout-summary">
            <span>Total</span>
            <strong>
              <Money amount={cart.subtotal} currency={cart.currency} />
            </strong>
          </div>
          <p className="muted">
            Payment details are entered only in Razorpay's hosted checkout. OpsPilot does not
            collect card, bank, or UPI credentials.
          </p>
          <button
            className="button button--primary"
            disabled={cart.requiresReview || paymentState.status === "creating"}
          >
            {paymentState.status === "creating"
              ? "Creating order..."
              : "Pay securely with Razorpay"}
          </button>
        </form>
      )}
    </section>
  );
}
