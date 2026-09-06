from enum import StrEnum

SERVICE_NAME = "opspilot-ai"
INTERNAL_CONTRACT_VERSION = 1
SIGNATURE_VERSION = "v1"

GROQ_API_ORIGIN = "https://api.groq.com"
GROQ_MODELS_URL = f"{GROQ_API_ORIGIN}/openai/v1/models"
GROQ_CHAT_COMPLETIONS_URL = f"{GROQ_API_ORIGIN}/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_REASONING_EFFORT = "low"

# One US dollar is represented by 10,000,000,000 exact integer ticks. These
# per-token values implement Groq's reviewed 2026-09-04 public prices of
# $0.15/M uncached input, $0.075/M cached input, and $0.60/M output.
GROQ_INPUT_COST_TICKS_PER_TOKEN = 1_500
GROQ_CACHED_INPUT_COST_TICKS_PER_TOKEN = 750
GROQ_OUTPUT_COST_TICKS_PER_TOKEN = 6_000

CUSTOMER_PROMPT_VERSION = "customer-help-v1"
OWNER_PROMPT_VERSION = "owner-overview-v1"
CUSTOMER_DOCUMENT_PROMPT_VERSION = "customer-documents-v1"
OWNER_DOCUMENT_PROMPT_VERSION = "owner-documents-v1"


class AssistantKind(StrEnum):
    CUSTOMER = "CUSTOMER"
    OWNER = "OWNER"


class AssistantIntent(StrEnum):
    CUSTOMER_HELP = "CUSTOMER_HELP"
    OWNER_OVERVIEW_EXPLAIN = "OWNER_OVERVIEW_EXPLAIN"
    CUSTOMER_DOCUMENT_QA = "CUSTOMER_DOCUMENT_QA"
    OWNER_DOCUMENT_QA = "OWNER_DOCUMENT_QA"


class Outcome(StrEnum):
    ANSWER = "ANSWER"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    REFUSAL = "REFUSAL"
    ESCALATE = "ESCALATE"


class SafeNotice(StrEnum):
    VERIFY_AUTHORITATIVE_DATA = "VERIFY_AUTHORITATIVE_DATA"
    USE_STANDARD_SUPPORT = "USE_STANDARD_SUPPORT"
    SNAPSHOT_MAY_BE_STALE = "SNAPSHOT_MAY_BE_STALE"
