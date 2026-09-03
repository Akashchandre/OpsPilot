export const SYSTEM_ROLES = Object.freeze({
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  CUSTOMER: "CUSTOMER",
});

export const PERMISSIONS = Object.freeze({
  USERS_READ: "users:read",
  USERS_STATUS_MANAGE: "users:status:manage",
  USERS_ROLES_MANAGE: "users:roles:manage",
  ROLES_READ: "roles:read",
  PERMISSIONS_READ: "permissions:read",
  PRODUCTS_MANAGE: "products:manage",
  CATEGORIES_MANAGE: "categories:manage",
  INVENTORY_READ: "inventory:read",
  INVENTORY_ADJUST: "inventory:adjust",
  ORDERS_READ: "orders:read",
  ORDERS_MANAGE: "orders:manage",
  PAYMENTS_READ: "payments:read",
  PAYMENTS_REFUND: "payments:refund",
  PAYMENTS_RECONCILE: "payments:reconcile",
  SUPPORT_TICKETS_READ: "support:tickets:read",
  SUPPORT_TICKETS_MANAGE: "support:tickets:manage",
  REPORTS_READ: "reports:read",
  AUDIT_READ: "audit:read",
  JOBS_READ: "jobs:read",
  JOBS_REPLAY: "jobs:replay",
  AI_CUSTOMER_USE: "ai:customer:use",
  AI_OWNER_USE: "ai:owner:use",
  AI_USAGE_READ: "ai:usage:read",
});

export const USER_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
});

export const SECURITY_EVENTS = Object.freeze({
  USER_REGISTERED: "USER_REGISTERED",
  LOGIN_SUCCEEDED: "LOGIN_SUCCEEDED",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT_SUCCEEDED: "LOGOUT_SUCCEEDED",
  OWNER_BOOTSTRAPPED: "OWNER_BOOTSTRAPPED",
  USER_STATUS_CHANGED: "USER_STATUS_CHANGED",
  ROLE_ASSIGNED: "ROLE_ASSIGNED",
  ROLE_REMOVED: "ROLE_REMOVED",
});

export const SECURITY_EVENT_OUTCOMES = Object.freeze({
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
});
