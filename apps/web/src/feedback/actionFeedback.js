import { toast } from "react-toastify";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const actionMessages = [
  { pattern: /^\/auth\/login$/, message: "Welcome back. You are signed in." },
  { pattern: /^\/auth\/register$/, message: "Your account was created successfully." },
  { pattern: /^\/auth\/logout$/, message: "You have been signed out safely." },
  { pattern: /^\/cart\/items$/, method: "DELETE", message: "Your cart was cleared." },
  {
    pattern: /^\/cart\/items\//,
    method: "DELETE",
    message: "The item was removed from your cart.",
  },
  { pattern: /^\/cart\/items\//, message: "Your cart was updated." },
  { pattern: /^\/orders$/, method: "POST", message: "Your order was created in Test Mode." },
  {
    pattern: /^\/orders\/[^/]+\/payment-session$/,
    message: "Secure Test Mode checkout is ready.",
  },
  { pattern: /^\/payments\/confirm$/, message: "Payment verification completed." },
  { pattern: /^\/payments\/[^/]+\/refunds$/, message: "The refund request was submitted." },
  {
    pattern: /^\/payments\/[^/]+\/reconcile$/,
    message: "Provider state was reconciled.",
  },
  { pattern: /^\/orders\/[^/]+\/status$/, message: "Order status was updated." },
  { pattern: /^\/orders\/[^/]+\/cancellation$/, message: "The order was cancelled." },
  { pattern: /^\/products/, message: "Product changes were saved." },
  { pattern: /^\/categories/, message: "Category changes were saved." },
  { pattern: /^\/inventory/, message: "Inventory was updated." },
  { pattern: /^\/users/, message: "User access was updated." },
  {
    pattern: /^\/support\/tickets$/,
    method: "POST",
    message: "Support request submitted successfully.",
  },
  { pattern: /^\/support\/tickets\/[^/]+\/messages$/, message: "Your message was sent." },
  { pattern: /^\/support\/tickets/, message: "Support ticket changes were saved." },
  { pattern: /^\/notifications\/read-all$/, message: "Notifications were marked as read." },
  { pattern: /^\/documents$/, method: "POST", message: "The document record was created." },
  { pattern: /^\/documents/, method: "DELETE", message: "Document deletion was requested." },
  { pattern: /^\/documents/, message: "Document changes were saved." },
  { pattern: /^\/jobs\/[^/]+\/replay$/, message: "The job replay was queued." },
  {
    pattern: /^\/ai\/(?:document-)?consents\//,
    method: "DELETE",
    message: "AI consent was revoked.",
  },
  {
    pattern: /^\/ai\/(?:document-)?consents\//,
    message: "AI consent preferences were updated.",
  },
  { pattern: /^\/ai\/workflow-runs\/[^/]+\/decision$/, message: "Workflow decision was saved." },
  { pattern: /^\/ai\/workflow-runs\/[^/]+\/cancellation$/, message: "Workflow run was cancelled." },
  { pattern: /^\/ai\/workflow-consents/, message: "Workflow consent was updated." },
  { pattern: /^\/ai\/workflows/, message: "The AI workflow started." },
  { pattern: /^\/ai\/.*responses$/, message: "The AI response is ready." },
];

export function isMutationMethod(method) {
  return MUTATION_METHODS.has(String(method).toUpperCase());
}

export function getActionSuccessMessage(path, method) {
  const normalizedMethod = String(method).toUpperCase();
  const match = actionMessages.find(
    (entry) =>
      entry.pattern.test(path) && (entry.method === undefined || entry.method === normalizedMethod),
  );
  if (match) return match.message;
  if (normalizedMethod === "DELETE") return "The item was removed successfully.";
  return "Your changes were saved successfully.";
}

function toastIdentifier(type, path, method) {
  return `${type}:${String(method).toUpperCase()}:${path}`;
}

export function notifyActionSuccess(path, method, message) {
  const content = message ?? getActionSuccessMessage(path, method);
  if (!content) return;
  toast.success(content, {
    toastId: toastIdentifier("success", path, method),
    role: "status",
    ariaLabel: "Action completed",
  });
}

export function notifyActionError(path, method, error, fallbackMessage) {
  const content = fallbackMessage ?? error?.message ?? "The action could not be completed.";
  toast.error(content, {
    toastId: toastIdentifier("error", path, method),
    role: "status",
    ariaLabel: "Action failed",
  });
}

export function notifyWarning(message, toastId = message) {
  toast.warning(message, { toastId, role: "status", ariaLabel: "Warning" });
}
