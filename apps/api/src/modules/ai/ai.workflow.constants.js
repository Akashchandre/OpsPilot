import { PERMISSIONS } from "../auth/auth.constants.js";

export const AI_WORKFLOW_NOTICE_VERSION = "groq-zdr-workflows-v1";
export const AI_WORKFLOW_GRAPH_VERSION = "v1";

export const AI_WORKFLOW_CODES = Object.freeze({
  BUSINESS_BRIEF: "OWNER_BUSINESS_BRIEF_V1",
  SUPPORT_REPLY: "SUPPORT_REPLY_DRAFT_V1",
});

export const AI_WORKFLOW_FOCUS = Object.freeze({
  GENERAL: "GENERAL",
  REVENUE: "REVENUE",
  INVENTORY: "INVENTORY",
  SUPPORT: "SUPPORT",
});

export const AI_WORKFLOW_STATUSES = Object.freeze({
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  APPROVED: "APPROVED",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
});

export const AI_WORKFLOW_TERMINAL_STATUSES = Object.freeze([
  AI_WORKFLOW_STATUSES.SUCCEEDED,
  AI_WORKFLOW_STATUSES.FAILED,
  AI_WORKFLOW_STATUSES.UNKNOWN,
  AI_WORKFLOW_STATUSES.CANCELLED,
  AI_WORKFLOW_STATUSES.EXPIRED,
]);

export const AI_WORKFLOW_TOOL_CODES = Object.freeze({
  REPORTS_OVERVIEW: "REPORTS_OVERVIEW_V1",
  INVENTORY_ATTENTION: "INVENTORY_ATTENTION_V1",
  SUPPORT_QUEUE_SUMMARY: "SUPPORT_QUEUE_SUMMARY_V1",
  SUPPORT_TICKET_PUBLIC_CONTEXT: "SUPPORT_TICKET_PUBLIC_CONTEXT_V1",
  DOCUMENTS_CUSTOMER_POLICY_CONTEXT: "DOCUMENTS_CUSTOMER_POLICY_CONTEXT_V1",
  SUPPORT_PUBLIC_REPLY: "SUPPORT_PUBLIC_REPLY_V1",
});

export const AI_WORKFLOW_TOOL_STATUSES = Object.freeze({
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
});

export const AI_WORKFLOW_ARTIFACT_KINDS = Object.freeze({
  TOOL_OUTPUT: "TOOL_OUTPUT",
  MODEL_DRAFT: "MODEL_DRAFT",
  REVIEWER_EDIT: "REVIEWER_EDIT",
  FINAL_RESULT: "FINAL_RESULT",
});

export const AI_WORKFLOW_APPROVAL_STATUSES = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
});

export const AI_WORKFLOW_DECISIONS = Object.freeze({
  APPROVE: "APPROVE",
  EDIT_AND_APPROVE: "EDIT_AND_APPROVE",
  REJECT: "REJECT",
});

export const AI_WORKFLOW_TOOL_SEQUENCES = Object.freeze({
  [AI_WORKFLOW_CODES.BUSINESS_BRIEF]: Object.freeze([
    AI_WORKFLOW_TOOL_CODES.REPORTS_OVERVIEW,
    AI_WORKFLOW_TOOL_CODES.INVENTORY_ATTENTION,
    AI_WORKFLOW_TOOL_CODES.SUPPORT_QUEUE_SUMMARY,
  ]),
  [AI_WORKFLOW_CODES.SUPPORT_REPLY]: Object.freeze([
    AI_WORKFLOW_TOOL_CODES.SUPPORT_TICKET_PUBLIC_CONTEXT,
    AI_WORKFLOW_TOOL_CODES.DOCUMENTS_CUSTOMER_POLICY_CONTEXT,
    AI_WORKFLOW_TOOL_CODES.SUPPORT_PUBLIC_REPLY,
  ]),
});

export const AI_WORKFLOW_REQUIRED_PERMISSIONS = Object.freeze({
  [AI_WORKFLOW_CODES.BUSINESS_BRIEF]: Object.freeze([
    PERMISSIONS.AI_WORKFLOWS_BUSINESS_USE,
    PERMISSIONS.AI_OWNER_USE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.SUPPORT_TICKETS_READ,
  ]),
  [AI_WORKFLOW_CODES.SUPPORT_REPLY]: Object.freeze([
    PERMISSIONS.AI_WORKFLOWS_SUPPORT_USE,
    PERMISSIONS.SUPPORT_TICKETS_READ,
    PERMISSIONS.SUPPORT_TICKETS_MANAGE,
    PERMISSIONS.ORDERS_READ,
  ]),
});

export const AI_WORKFLOW_CONSENT_NOTICES = Object.freeze({
  OWNER: Object.freeze({
    version: AI_WORKFLOW_NOTICE_VERSION,
    provider: "GROQ",
    providerName: "Groq",
    assistant: "OWNER",
    title: "AI workflow processing notice",
    generatedOutput: "The business brief is AI-generated and may be incorrect.",
    retention:
      "OpsPilot requires Groq Zero Data Retention and keeps only short-lived encrypted workflow artifacts.",
    warning: "Verify authoritative facts in OpsPilot before acting on generated suggestions.",
    dataSent:
      "Bounded aggregate reports, inventory attention rows, and support queue counts are sent to Groq.",
  }),
  SUPPORT: Object.freeze({
    version: AI_WORKFLOW_NOTICE_VERSION,
    provider: "GROQ",
    providerName: "Groq",
    assistant: "SUPPORT",
    title: "AI support workflow processing notice",
    generatedOutput: "The support reply is AI-generated and requires human approval.",
    retention:
      "OpsPilot requires Groq Zero Data Retention and keeps only short-lived encrypted workflow artifacts.",
    warning:
      "Never include internal notes, credentials, payment data, or unnecessary personal data.",
    dataSent:
      "One ticket's bounded customer-visible conversation, minimal order status, and customer-policy excerpts are sent to Groq.",
  }),
});
