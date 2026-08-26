import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getProduct } from "../api/catalog.js";
import { Money } from "../components/Money.jsx";

export function ProductDetailPage() {
  const { productId } = useParams();
  const [state, setState] = useState({ status: "loading", product: null, error: "" });

  useEffect(() => {
    const controller = new AbortController();
    getProduct(productId, { signal: controller.signal })
      .then((product) => setState({ status: "ready", product, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", product: null, error: error.message });
        }
      });
    return () => controller.abort();
  }, [productId]);

  if (state.status === "loading") {
    return (
      <p className="route-state" role="status">
        Loading product…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <section className="panel route-state" role="alert">
        <h1>Product unavailable</h1>
        <p>{state.error}</p>
        <Link className="button button--quiet" to="/products">
          Back to products
        </Link>
      </section>
    );
  }

  const product = state.product;
  return (
    <article className="product-detail">
      <div className="product-detail__visual" aria-hidden="true">
        {product.name.slice(0, 2).toUpperCase()}
      </div>
      <div>
        <Link className="back-link" to="/products">
          ← All products
        </Link>
        <p className="eyebrow">{product.sku}</p>
        <h1>{product.name}</h1>
        <p className="product-detail__description">{product.description}</p>
        <div className="category-chips">
          {product.categories.map((category) => (
            <span key={category.id}>{category.name}</span>
          ))}
        </div>
        <div className="product-detail__purchase">
          <strong className="price">
            <Money amount={product.price} currency={product.currency} />
          </strong>
          <span className={`stock stock--${product.availability.inStock ? "in" : "out"}`}>
            {product.availability.inStock ? "Available" : "Currently out of stock"}
          </span>
        </div>
        <p className="muted">Cart and ordering begin in Phase 4.</p>
      </div>
    </article>
  );
}
