import { PERMISSIONS } from "../auth/auth.constants.js";

export const AI_PROVIDER = "GROQ";
export const AI_MODEL = "openai/gpt-oss-120b";
export const AI_INTERNAL_CONTRACT_VERSION = 1;
export const AI_NOTICE_VERSION = "groq-zdr-v1";
export const AI_DOCUMENT_NOTICE_VERSION = "groq-zdr-documents-v1";

export const AI_ASSISTANTS = Object.freeze({
  CUSTOMER: "CUSTOMER",
  OWNER: "OWNER",
});

export const AI_INTENTS = Object.freeze({
  CUSTOMER_HELP: "CUSTOMER_HELP",
  OWNER_OVERVIEW_EXPLAIN: "OWNER_OVERVIEW_EXPLAIN",
  CUSTOMER_DOCUMENT_QA: "CUSTOMER_DOCUMENT_QA",
  OWNER_DOCUMENT_QA: "OWNER_DOCUMENT_QA",
});

export const AI_PROMPT_VERSIONS = Object.freeze({
  CUSTOMER: "customer-help-v1",
  OWNER: "owner-overview-v1",
});

export const AI_DOCUMENT_PROMPT_VERSIONS = Object.freeze({
  CUSTOMER: "customer-documents-v1",
  OWNER: "owner-documents-v1",
});

export const AI_USAGE_STATUSES = Object.freeze({
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
});

export const AI_OUTCOMES = Object.freeze({
  ANSWER: "ANSWER",
  READY_FOR_REVIEW: "READY_FOR_REVIEW",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  REFUSAL: "REFUSAL",
  ESCALATE: "ESCALATE",
});

export const AI_SAFE_NOTICES = Object.freeze({
  VERIFY_AUTHORITATIVE_DATA: "VERIFY_AUTHORITATIVE_DATA",
  USE_STANDARD_SUPPORT: "USE_STANDARD_SUPPORT",
  SNAPSHOT_MAY_BE_STALE: "SNAPSHOT_MAY_BE_STALE",
});

export const AI_COST_TICKS_PER_USD_CENT = 100_000_000n;

export const AI_ASSISTANT_POLICIES = Object.freeze({
  [AI_ASSISTANTS.CUSTOMER]: Object.freeze({
    intent: AI_INTENTS.CUSTOMER_HELP,
    permission: PERMISSIONS.AI_CUSTOMER_USE,
    promptVersion: AI_PROMPT_VERSIONS.CUSTOMER,
    noticeVersion: AI_NOTICE_VERSION,
    configKey: "customer",
  }),
  [AI_ASSISTANTS.OWNER]: Object.freeze({
    intent: AI_INTENTS.OWNER_OVERVIEW_EXPLAIN,
    permission: PERMISSIONS.AI_OWNER_USE,
    additionalPermissions: Object.freeze([PERMISSIONS.REPORTS_READ]),
    promptVersion: AI_PROMPT_VERSIONS.OWNER,
    noticeVersion: AI_NOTICE_VERSION,
    configKey: "owner",
  }),
});

export const AI_DOCUMENT_ASSISTANT_POLICIES = Object.freeze({
  [AI_ASSISTANTS.CUSTOMER]: Object.freeze({
    intent: AI_INTENTS.CUSTOMER_DOCUMENT_QA,
    permission: PERMISSIONS.AI_CUSTOMER_USE,
    promptVersion: AI_DOCUMENT_PROMPT_VERSIONS.CUSTOMER,
    noticeVersion: AI_DOCUMENT_NOTICE_VERSION,
    configKey: "customer",
    document: true,
  }),
  [AI_ASSISTANTS.OWNER]: Object.freeze({
    intent: AI_INTENTS.OWNER_DOCUMENT_QA,
    permission: PERMISSIONS.AI_OWNER_USE,
    promptVersion: AI_DOCUMENT_PROMPT_VERSIONS.OWNER,
    noticeVersion: AI_DOCUMENT_NOTICE_VERSION,
    configKey: "owner",
    document: true,
  }),
});

const commonNotice = Object.freeze({
  version: AI_NOTICE_VERSION,
  provider: AI_PROVIDER,
  providerName: "Groq",
  title: "AI processing notice",
  generatedOutput: "The response is AI-generated and may be incorrect.",
  retention:
    "OpsPilot requires Groq Zero Data Retention in Data Controls. Requests are blocked unless an operator confirms that setting.",
  warning: "Do not enter passwords, payment details, personal data, or other secrets.",
});

export const AI_CONSENT_NOTICES = Object.freeze({
  [AI_ASSISTANTS.CUSTOMER]: Object.freeze({
    ...commonNotice,
    assistant: AI_ASSISTANTS.CUSTOMER,
    dataSent:
      "Your question and a reviewed list of public OpsPilot customer features and navigation facts are sent to Groq.",
  }),
  [AI_ASSISTANTS.OWNER]: Object.freeze({
    ...commonNotice,
    assistant: AI_ASSISTANTS.OWNER,
    dataSent:
      "Your question and the selected authoritative aggregate OpsPilot overview are sent to Groq. No row-level records are included.",
  }),
});

const commonDocumentNotice = Object.freeze({
  version: AI_DOCUMENT_NOTICE_VERSION,
  provider: AI_PROVIDER,
  providerName: "Groq",
  title: "AI document processing notice",
  generatedOutput: "The response is AI-generated and may be incorrect.",
  retention:
    "OpsPilot requires Groq Zero Data Retention in Data Controls. Requests are blocked unless an operator confirms that setting.",
  warning:
    "Your question and authorized document passages are sent to Groq. Do not include passwords, payment details, personal data, or other secrets.",
});

export const AI_DOCUMENT_CONSENT_NOTICES = Object.freeze({
  [AI_ASSISTANTS.CUSTOMER]: Object.freeze({
    ...commonDocumentNotice,
    assistant: AI_ASSISTANTS.CUSTOMER,
    dataSent:
      "Your question and up to five bounded passages from current customer-audience company documents are sent to Groq.",
  }),
  [AI_ASSISTANTS.OWNER]: Object.freeze({
    ...commonDocumentNotice,
    assistant: AI_ASSISTANTS.OWNER,
    dataSent:
      "Your question and up to five bounded passages from current customer- or owner-audience company documents are sent to Groq.",
  }),
});

export function policyForAssistant(assistant) {
  return AI_ASSISTANT_POLICIES[assistant] ?? null;
}

export function documentPolicyForAssistant(assistant) {
  return AI_DOCUMENT_ASSISTANT_POLICIES[assistant] ?? null;
}
