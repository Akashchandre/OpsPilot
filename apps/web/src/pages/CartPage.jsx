import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { clearCart, getCart, removeCartItem, setCartItem } from "../api/commerce.js";
import { Money } from "../components/Money.jsx";

export function CartPage() {
  const [state, setState] = useState({ status: "loading", cart: null, error: "", notice: "" });

  useEffect(() => {
    const controller = new AbortController();
    getCart({ signal: controller.signal })
      .then((cart) => setState({ status: "ready", cart, error: "", notice: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", cart: null, error: error.message, notice: "" });
        }
      });
    return () => controller.abort();
  }, []);

  async function run(action, notice) {
    setState((current) => ({ ...current, status: "saving", error: "", notice: "" }));
    try {
      const cart = await action();
      setState({ status: "ready", cart, error: "", notice });
    } catch (error) {
      setState((current) => ({ ...current, status: "ready", error: error.message, notice: "" }));
    }
  }

  if (state.status === "loading") {
    return <p role="status">Loading your cart...</p>;
  }
  if (!state.cart) {
    return (
      <section className="panel route-state" role="alert">
        <h1>Cart unavailable</h1>
        <p>{state.error}</p>
      </section>
    );
  }

  const cart = state.cart;
  return (
    <section className="commerce-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR CART</p>
          <h1>Review your items</h1>
          <p className="muted">Prices and availability are checked again at checkout.</p>
        </div>
        <strong className="price">
          <Money amount={cart.subtotal} currency={cart.currency} />
        </strong>
      </div>

      {state.error ? (
        <p className="global-alert" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p className="success-message" role="status">
          {state.notice}
        </p>
      ) : null}
      {cart.requiresReview ? (
        <p className="global-alert" role="alert">
          A price or availability changed. Save each affected quantity before checkout.
        </p>
      ) : null}

      {cart.items.length === 0 ? (
        <div className="panel empty-state">
          <h2>Your cart is empty</h2>
          <Link className="button button--primary" to="/products">
            Browse products
          </Link>
        </div>
      ) : (
        <>
          <div className="commerce-list">
            {cart.items.map((item) => (
              <article className="panel cart-line" key={item.product.id}>
                <div>
                  <p className="eyebrow">{item.product.sku}</p>
                  <h2>{item.product.name}</h2>
                  <p className="muted">
                    <Money amount={item.currentUnitPrice} currency={item.currency} /> each
                  </p>
                  {item.priceChanged ? (
                    <span className="badge badge--warning">Price changed</span>
                  ) : null}
                  {!item.purchasable ? (
                    <span className="badge badge--danger">Review required</span>
                  ) : null}
                </div>
                <form
                  className="cart-line__actions"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const quantity = Number(new FormData(event.currentTarget).get("quantity"));
                    run(
                      () => setCartItem(item.product.id, { quantity, version: cart.version }),
                      "Cart updated.",
                    );
                  }}
                >
                  <label>
                    <span>Quantity</span>
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      max="99"
                      defaultValue={item.quantity}
                    />
                  </label>
                  <strong>
                    <Money amount={item.lineTotal} currency={item.currency} />
                  </strong>
                  <button className="button button--quiet" disabled={state.status === "saving"}>
                    Update
                  </button>
                  <button
                    className="button button--danger"
                    type="button"
                    disabled={state.status === "saving"}
                    onClick={() =>
                      run(() => removeCartItem(item.product.id, cart.version), "Item removed.")
                    }
                  >
                    Remove
                  </button>
                </form>
              </article>
            ))}
          </div>
          <div className="commerce-actions">
            <button
              className="button button--quiet"
              disabled={state.status === "saving"}
              onClick={() => run(() => clearCart(cart.version), "Cart cleared.")}
            >
              Clear cart
            </button>
            <Link
              className={`button button--primary${cart.requiresReview ? " button--disabled" : ""}`}
              aria-disabled={cart.requiresReview}
              to={cart.requiresReview ? "/cart" : "/checkout"}
            >
              Continue to checkout
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
