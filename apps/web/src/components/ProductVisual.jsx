import { useState } from "react";
import { productImageForSku } from "../catalog/productPresentation.js";

export function ProductVisual({ product, className, eager = false }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = productImageForSku(product.sku);

  if (!imageUrl || failed) {
    return (
      <div className={className} aria-hidden="true">
        {product.name.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      className={className}
      src={imageUrl}
      alt={product.name}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      onError={() => setFailed(true)}
    />
  );
}
