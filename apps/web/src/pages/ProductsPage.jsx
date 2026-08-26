import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listCategories, listProducts } from "../api/catalog.js";
import { Money } from "../components/Money.jsx";

const initialFilters = {
  search: "",
  category: "",
  availability: "all",
  sort: "createdAt",
  direction: "desc",
};

export function ProductsPage() {
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ status: "loading", products: [], meta: null, error: "" });
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    listCategories({ limit: 100, signal: controller.signal })
      .then((result) => setCategories(result.categories))
      .catch((error) => {
        if (error.name !== "AbortError")
          setState((current) => ({ ...current, error: error.message }));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listProducts({ ...filters, page, limit: 12, signal: controller.signal })
      .then(({ products, meta }) => setState({ status: "ready", products, meta, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", products: [], meta: null, error: error.message });
        }
      });
    return () => controller.abort();
  }, [filters, page]);

  function submitFilters(event) {
    event.preventDefault();
    setState((current) => ({ ...current, status: "loading", error: "" }));
    setPage(1);
    setFilters(draftFilters);
  }

  return (
    <section className="catalog-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE CATALOG</p>
          <h1>Products</h1>
          <p className="muted">Browse active products. Exact stock remains private.</p>
        </div>
        <span className="record-count">{state.meta?.total ?? 0} products</span>
      </div>

      <form className="catalog-filters" onSubmit={submitFilters}>
        <label>
          <span>Search</span>
          <input
            value={draftFilters.search}
            maxLength={100}
            placeholder="Name or SKU"
            onChange={(event) => setDraftFilters({ ...draftFilters, search: event.target.value })}
          />
        </label>
        <label>
          <span>Category</span>
          <select
            value={draftFilters.category}
            onChange={(event) => setDraftFilters({ ...draftFilters, category: event.target.value })}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option value={category.slug} key={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Availability</span>
          <select
            value={draftFilters.availability}
            onChange={(event) =>
              setDraftFilters({ ...draftFilters, availability: event.target.value })
            }
          >
            <option value="all">All</option>
            <option value="inStock">In stock</option>
            <option value="outOfStock">Out of stock</option>
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select
            value={`${draftFilters.sort}:${draftFilters.direction}`}
            onChange={(event) => {
              const [sort, direction] = event.target.value.split(":");
              setDraftFilters({ ...draftFilters, sort, direction });
            }}
          >
            <option value="createdAt:desc">Newest</option>
            <option value="name:asc">Name A–Z</option>
            <option value="price:asc">Price low–high</option>
            <option value="price:desc">Price high–low</option>
          </select>
        </label>
        <button className="button button--secondary" type="submit">
          Apply
        </button>
      </form>

      {state.error ? (
        <p className="global-alert" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.status === "loading" ? (
        <p className="route-state" role="status">
          Loading products…
        </p>
      ) : null}
      {state.status === "ready" && state.products.length === 0 ? (
        <section className="panel empty-state">
          <h2>No products found</h2>
          <p className="muted">Try changing the search or availability filters.</p>
        </section>
      ) : null}

      <div className="product-grid">
        {state.products.map((product) => (
          <article className="product-card" key={product.id}>
            <div className="product-card__visual" aria-hidden="true">
              {product.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="product-card__content">
              <div className="product-card__topline">
                <span className="sku">{product.sku}</span>
                <span className={`stock stock--${product.availability.inStock ? "in" : "out"}`}>
                  {product.availability.inStock ? "In stock" : "Out of stock"}
                </span>
              </div>
              <h2>{product.name}</h2>
              <p className="product-card__description">{product.description}</p>
              <div className="category-chips">
                {product.categories.map((category) => (
                  <span key={category.id}>{category.name}</span>
                ))}
              </div>
              <div className="product-card__footer">
                <strong className="price">
                  <Money amount={product.price} currency={product.currency} />
                </strong>
                <Link className="button button--quiet" to={`/products/${product.id}`}>
                  View details
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      {state.meta && state.meta.totalPages > 1 ? (
        <nav className="pagination" aria-label="Product pages">
          <button
            className="button button--quiet"
            type="button"
            disabled={page <= 1}
            onClick={() => {
              setState((current) => ({ ...current, status: "loading", error: "" }));
              setPage((current) => current - 1);
            }}
          >
            Previous
          </button>
          <span>
            Page {page} of {state.meta.totalPages}
          </span>
          <button
            className="button button--quiet"
            type="button"
            disabled={page >= state.meta.totalPages}
            onClick={() => {
              setState((current) => ({ ...current, status: "loading", error: "" }));
              setPage((current) => current + 1);
            }}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}
