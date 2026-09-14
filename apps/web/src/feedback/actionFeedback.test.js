import { describe, expect, it } from "vitest";
import { getActionSuccessMessage, isMutationMethod } from "./actionFeedback.js";

describe("action feedback", () => {
  it("recognizes methods that represent user mutations", () => {
    expect(isMutationMethod("post")).toBe(true);
    expect(isMutationMethod("PATCH")).toBe(true);
    expect(isMutationMethod("GET")).toBe(false);
  });

  it("returns contextual messages for important customer and operator actions", () => {
    expect(getActionSuccessMessage("/cart/items/product-1", "PUT")).toBe("Your cart was updated.");
    expect(getActionSuccessMessage("/orders", "POST")).toBe("Your order was created in Test Mode.");
    expect(getActionSuccessMessage("/inventory/product-1/adjustments", "POST")).toBe(
      "Inventory was updated.",
    );
    expect(getActionSuccessMessage("/ai/workflow-consents/consent-1", "PATCH")).toBe(
      "Workflow consent was updated.",
    );
  });

  it("uses a safe generic message for an unclassified mutation", () => {
    expect(getActionSuccessMessage("/future-action", "DELETE")).toBe(
      "The item was removed successfully.",
    );
    expect(getActionSuccessMessage("/future-action", "POST")).toBe(
      "Your changes were saved successfully.",
    );
  });
});
