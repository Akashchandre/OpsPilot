import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductVisual } from "./ProductVisual.jsx";

describe("ProductVisual", () => {
  it("renders an approved image and falls back to initials if loading fails", () => {
    const product = { sku: "DEMO-DESK-001", name: "Office Desk" };
    render(<ProductVisual product={product} className="product-card__visual" />);

    const image = screen.getByRole("img", { name: "Office Desk" });
    expect(image).toHaveAttribute("src", "/products/office-desk.jpg");
    expect(image).toHaveAttribute("loading", "lazy");

    fireEvent.error(image);
    expect(screen.queryByRole("img", { name: "Office Desk" })).not.toBeInTheDocument();
    expect(screen.getByText("OF")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the initials fallback for an unmapped product", () => {
    render(
      <ProductVisual
        product={{ sku: "NEW-001", name: "New Product" }}
        className="product-detail__visual"
        eager
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("NE")).toHaveAttribute("aria-hidden", "true");
  });
});
