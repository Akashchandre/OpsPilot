import { useEffect, useState } from "react";
import {
  createCategory,
  createProduct,
  listCategories,
  listProducts,
  updateCategory,
  updateCategoryStatus,
  updateProduct,
  updateProductStatus,
} from "../api/catalog.js";
import { useAuth } from "../auth/auth-context.js";
import { Money } from "../components/Money.jsx";

const nextProductStatus = { DRAFT: "ACTIVE", ACTIVE: "ARCHIVED", ARCHIVED: "DRAFT" };
const productStatusAction = { DRAFT: "Activate", ACTIVE: "Archive", ARCHIVED: "Restore to draft" };

function CategoryEditor({ category, busy, onSave, onToggle }) {
  const [form, setForm] = useState({
    slug: category.slug,
    name: category.name,
    description: category.description ?? "",
  });

  return (
    <form
      className="management-card"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...form, version: category.version });
      }}
    >
      <div className="management-card__heading">
        <div>
          <span className={`badge badge--${category.status.toLowerCase()}`}>{category.status}</span>
          <strong>{category.productCount ?? 0} product links</strong>
        </div>
        <span className="sku">v{category.version}</span>
      </div>
      <label>
        <span>Name</span>
        <input
          value={form.name}
          minLength={2}
          maxLength={100}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </label>
      <label>
        <span>Slug</span>
        <input
          value={form.slug}
          maxLength={100}
          onChange={(event) => setForm({ ...form, slug: event.target.value })}
        />
      </label>
      <label>
        <span>Description</span>
        <textarea
          value={form.description}
          maxLength={500}
          rows={2}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </label>
      <div className="management-card__actions">
        <button className="button button--secondary" type="submit" disabled={busy}>
          Save category
        </button>
        <button className="button button--quiet" type="button" disabled={busy} onClick={onToggle}>
          {category.status === "ACTIVE" ? "Deactivate" : "Activate"}
        </button>
      </div>
    </form>
  );
}

function ProductEditor({ product, categories, busy, onSave, onStatus }) {
  const [form, setForm] = useState({
    name: product.name,
    description: product.description,
    price: product.price,
    categoryIds: product.categories.map((category) => category.id),
  });

  function toggleCategory(categoryId) {
    setForm((current) => ({
      ...current,
      categoryIds: current.categoryIds.includes(categoryId)
        ? current.categoryIds.filter((id) => id !== categoryId)
        : [...current.categoryIds, categoryId],
    }));
  }

  return (
    <form
      className="management-card product-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...form, version: product.version });
      }}
    >
      <div className="management-card__heading">
        <div>
          <span className={`badge badge--${product.status.toLowerCase()}`}>{product.status}</span>
          <span className={`stock stock--${product.availability.inStock ? "in" : "out"}`}>
            {product.availability.inStock ? "In stock" : "Out of stock"}
          </span>
        </div>
        <span className="sku">
          {product.sku} · v{product.version}
        </span>
      </div>
      <label>
        <span>Name</span>
        <input
          value={form.name}
          minLength={2}
          maxLength={160}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </label>
      <label>
        <span>Description</span>
        <textarea
          value={form.description}
          maxLength={5000}
          rows={3}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </label>
      <label>
        <span>Price ({product.currency})</span>
        <input
          value={form.price}
          inputMode="decimal"
          pattern="^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$"
          onChange={(event) => setForm({ ...form, price: event.target.value })}
        />
      </label>
      <fieldset className="checkbox-fieldset">
        <legend>Categories</legend>
        {categories.map((category) => (
          <label key={category.id}>
            <input
              type="checkbox"
              checked={form.categoryIds.includes(category.id)}
              disabled={category.status !== "ACTIVE"}
              onChange={() => toggleCategory(category.id)}
            />
            <span>
              {category.name} {category.status !== "ACTIVE" ? "(inactive)" : ""}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="management-card__summary">
        <Money amount={product.price} currency={product.currency} />
      </div>
      <div className="management-card__actions">
        <button className="button button--secondary" type="submit" disabled={busy}>
          Save product
        </button>
        <button className="button button--quiet" type="button" disabled={busy} onClick={onStatus}>
          {productStatusAction[product.status]}
        </button>
      </div>
    </form>
  );
}

export function CatalogAdminPage() {
  const auth = useAuth();
  const canManageCategories = auth.hasPermission("categories:manage");
  const [state, setState] = useState({
    status: "loading",
    products: [],
    categories: [],
    error: "",
  });
  const [busyKey, setBusyKey] = useState("");
  const [categoryForm, setCategoryForm] = useState({ slug: "", name: "", description: "" });
  const [productForm, setProductForm] = useState({
    sku: "",
    name: "",
    description: "",
    price: "",
    categoryIds: [],
    initialQuantity: "0",
    lowStockThreshold: "0",
  });

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listProducts({ view: "management", limit: 100, signal: controller.signal }),
      listCategories({
        view: canManageCategories ? "management" : "public",
        limit: 100,
        signal: controller.signal,
      }),
    ])
      .then(([productResult, categoryResult]) =>
        setState({
          status: "ready",
          products: productResult.products,
          categories: categoryResult.categories,
          error: "",
        }),
      )
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState((current) => ({ ...current, status: "error", error: error.message }));
        }
      });
    return () => controller.abort();
  }, [canManageCategories]);

  async function mutate(key, operation, apply) {
    setBusyKey(key);
    setState((current) => ({ ...current, error: "" }));
    try {
      apply(await operation());
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setBusyKey("");
    }
  }

  function replaceProduct(product) {
    setState((current) => ({
      ...current,
      products: current.products.map((entry) => (entry.id === product.id ? product : entry)),
    }));
  }

  function replaceCategory(category) {
    setState((current) => ({
      ...current,
      categories: current.categories.map((entry) => (entry.id === category.id ? category : entry)),
    }));
  }

  async function submitCategory(event) {
    event.preventDefault();
    await mutate(
      "new-category",
      () => createCategory(categoryForm),
      (category) => {
        setState((current) => ({ ...current, categories: [...current.categories, category] }));
        setCategoryForm({ slug: "", name: "", description: "" });
      },
    );
  }

  async function submitProduct(event) {
    event.preventDefault();
    await mutate(
      "new-product",
      () =>
        createProduct({
          ...productForm,
          initialQuantity: Number(productForm.initialQuantity),
          lowStockThreshold: Number(productForm.lowStockThreshold),
        }),
      (product) => {
        setState((current) => ({ ...current, products: [product, ...current.products] }));
        setProductForm({
          sku: "",
          name: "",
          description: "",
          price: "",
          categoryIds: [],
          initialQuantity: "0",
          lowStockThreshold: "0",
        });
      },
    );
  }

  if (state.status === "loading") {
    return (
      <p className="route-state" role="status">
        Loading catalog management…
      </p>
    );
  }

  return (
    <section className="admin-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CATALOG OPERATIONS</p>
          <h1>Catalog management</h1>
          <p className="muted">
            Create drafts, maintain categories, and control product lifecycle.
          </p>
        </div>
        <span className="record-count">{state.products.length} products</span>
      </div>

      {state.error ? (
        <p className="global-alert" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="management-create-grid">
        {canManageCategories ? (
          <form className="panel management-form" onSubmit={submitCategory}>
            <h2>Create category</h2>
            <label>
              <span>Name</span>
              <input
                required
                minLength={2}
                maxLength={100}
                value={categoryForm.name}
                onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
              />
            </label>
            <label>
              <span>Slug</span>
              <input
                required
                maxLength={100}
                value={categoryForm.slug}
                placeholder="office-chairs"
                onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })}
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                rows={3}
                maxLength={500}
                value={categoryForm.description}
                onChange={(event) =>
                  setCategoryForm({ ...categoryForm, description: event.target.value })
                }
              />
            </label>
            <button className="button button--primary" disabled={busyKey !== ""} type="submit">
              Create category
            </button>
          </form>
        ) : null}

        <form className="panel management-form" onSubmit={submitProduct}>
          <h2>Create draft product</h2>
          <div className="form-row">
            <label>
              <span>SKU</span>
              <input
                required
                maxLength={64}
                value={productForm.sku}
                onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })}
              />
            </label>
            <label>
              <span>Price (INR)</span>
              <input
                required
                inputMode="decimal"
                value={productForm.price}
                onChange={(event) => setProductForm({ ...productForm, price: event.target.value })}
              />
            </label>
          </div>
          <label>
            <span>Name</span>
            <input
              required
              minLength={2}
              maxLength={160}
              value={productForm.name}
              onChange={(event) => setProductForm({ ...productForm, name: event.target.value })}
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              rows={3}
              maxLength={5000}
              value={productForm.description}
              onChange={(event) =>
                setProductForm({ ...productForm, description: event.target.value })
              }
            />
          </label>
          <div className="form-row">
            <label>
              <span>Initial quantity</span>
              <input
                type="number"
                min="0"
                max="2000000000"
                value={productForm.initialQuantity}
                onChange={(event) =>
                  setProductForm({ ...productForm, initialQuantity: event.target.value })
                }
              />
            </label>
            <label>
              <span>Low-stock threshold</span>
              <input
                type="number"
                min="0"
                max="2000000000"
                value={productForm.lowStockThreshold}
                onChange={(event) =>
                  setProductForm({ ...productForm, lowStockThreshold: event.target.value })
                }
              />
            </label>
          </div>
          <fieldset className="checkbox-fieldset">
            <legend>Categories</legend>
            {state.categories
              .filter((category) => category.status === "ACTIVE")
              .map((category) => (
                <label key={category.id}>
                  <input
                    type="checkbox"
                    checked={productForm.categoryIds.includes(category.id)}
                    onChange={() =>
                      setProductForm((current) => ({
                        ...current,
                        categoryIds: current.categoryIds.includes(category.id)
                          ? current.categoryIds.filter((id) => id !== category.id)
                          : [...current.categoryIds, category.id],
                      }))
                    }
                  />
                  <span>{category.name}</span>
                </label>
              ))}
          </fieldset>
          <button className="button button--primary" disabled={busyKey !== ""} type="submit">
            Create product
          </button>
        </form>
      </div>

      {canManageCategories ? (
        <section className="management-section">
          <h2>Categories</h2>
          <div className="management-grid management-grid--categories">
            {state.categories.map((category) => (
              <CategoryEditor
                category={category}
                busy={busyKey === `category-${category.id}`}
                key={`${category.id}-${category.version}`}
                onSave={(input) =>
                  mutate(
                    `category-${category.id}`,
                    () => updateCategory(category.id, input),
                    replaceCategory,
                  )
                }
                onToggle={() =>
                  mutate(
                    `category-${category.id}`,
                    () =>
                      updateCategoryStatus(
                        category.id,
                        category.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                        category.version,
                      ),
                    replaceCategory,
                  )
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="management-section">
        <h2>Products</h2>
        {state.products.length === 0 ? (
          <p className="muted">No products have been created.</p>
        ) : null}
        <div className="management-grid">
          {state.products.map((product) => (
            <ProductEditor
              product={product}
              categories={state.categories}
              busy={busyKey === `product-${product.id}`}
              key={`${product.id}-${product.version}`}
              onSave={(input) =>
                mutate(
                  `product-${product.id}`,
                  () => updateProduct(product.id, input),
                  replaceProduct,
                )
              }
              onStatus={() =>
                mutate(
                  `product-${product.id}`,
                  () =>
                    updateProductStatus(
                      product.id,
                      nextProductStatus[product.status],
                      product.version,
                    ),
                  replaceProduct,
                )
              }
            />
          ))}
        </div>
      </section>
    </section>
  );
}
