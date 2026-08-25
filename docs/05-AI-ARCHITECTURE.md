# AI Architecture

## Status and boundaries

This document describes the future AI direction only. Do not implement, connect, install, or provision AI dependencies during the documentation stage or Phase 1.

AI does not replace authentication, authorization, deterministic business rules, database constraints, payment logic, or human approval for consequential actions.

## Conceptual flow

```text
User
  |
  v
React
  |
  v
Node.js API (authenticates, authorizes, scopes, rate-limits)
  |
  v
Python FastAPI AI service (internal authenticated boundary)
  |
  v
LangChain / LangGraph orchestration
  |------------|--------------------|
  v            v                    v
RAG        Business data tools   Support tools
  |            |                    |
  +------------+--------------------+
               |
               v
       Grounded response/result
               |
               v
        Node.js policy boundary
               |
               v
              User
```

## Capability 1: Customer AI assistant

The customer assistant may answer company-policy/document questions and questions about the authenticated customer's own account or orders where appropriate. It must not expose other customers, internal-only documents, hidden prompts, staff data, or unauthorized operational information.

Exact intents, channels, escalation behavior, citations, streaming, retention, and whether it can initiate any action are a **Decision Required**.

## Capability 2: Business owner AI assistant

The owner assistant may answer authorized questions about business data and produce business insights. Results must make scope and freshness clear, distinguish calculated facts from generated interpretation, and respect granular permissions for future admins/managers/employees.

Approved metrics, analysis tools, export behavior, time ranges, data freshness, and action permissions are a **Decision Required**.

## Capability 3: RAG over company documents

The RAG pipeline is expected to:

1. Accept authorized uploads through Node.js.
2. Store the original document in protected object storage.
3. Validate type/size, scan according to policy, extract text, and record version/checksum.
4. Chunk and embed approved content through background processing.
5. Store vectors with document, version, business, audience, and access metadata.
6. Retrieve using server-established access filters.
7. Build a bounded prompt from the query and retrieved content.
8. Return an answer with provenance/citations and safe fallback when evidence is insufficient.

Supported formats, OCR, chunking, embedding model, vector database, ranking, citation format, document audiences, versioning, retention, and deletion propagation are **Decision Required**.

## Capability 4: AI-powered support

AI may classify or summarize tickets, retrieve approved answers, suggest responses, gather permitted order context, and support routing. Autonomous customer-visible responses or state-changing actions require explicit policy and appropriate human confirmation.

SLA, confidence thresholds, escalation rules, agent review, supported actions, and audit requirements are **Decision Required**.

## Capability 5: Business-data querying

Do not let a model execute unrestricted SQL. Use narrow, allowlisted tools implemented through the business service/data-access layer. Each tool must define:

- Typed, validated inputs and bounded outputs.
- Required permission and business/user scope.
- Allowed aggregates, filters, time ranges, and row limits.
- Query timeout and cost controls.
- Sensitive-field redaction.
- Freshness metadata and audit behavior.

Generated narrative must clearly identify inferred insights and must not fabricate absent data.

## Capability 6: LangGraph workflows

LangGraph is planned for stateful multi-step workflows in Phase 9, such as business analysis or AI-assisted support. Graphs should use explicit state, bounded loops, timeouts, approved tools, checkpoints only where needed, deterministic error paths, and human approval nodes for consequential actions.

Workflow inventory, persistence/checkpoint store, interruption/recovery, approval UI, and replay policy are **Decision Required**.

## Service responsibilities

### Node.js API

- Owns public authentication, authorization, user/business scope, rate limits, and API contracts.
- Fetches or exposes business capabilities through controlled application services.
- Sends minimum necessary context to the AI service.
- Enforces confirmation and records durable application/audit outcomes.

### Python/FastAPI AI service

- Owns model/provider adapters, prompt templates, retrieval orchestration, graph workflows, AI evaluations, and safe tool invocation requests.
- Accepts only authenticated internal calls.
- Does not become a backdoor around Node.js authorization or database rules.

### LangChain and LangGraph

- LangChain provides model, retrieval, prompt, and tool integration where it reduces custom integration cost.
- LangGraph is reserved for workflows that truly need explicit state and multi-step control.
- Neither library should be added merely because it is in the eventual technology direction.

## Security and safety

- Treat user input, documents, retrieved text, tool results, and model output as untrusted.
- Test prompt injection, indirect injection, tool manipulation, data exfiltration, cross-user/business retrieval, unsafe output rendering, and denial/cost abuse.
- Enforce access filters before and during retrieval, not after generation alone.
- Keep system prompts, credentials, provider keys, internal identifiers, and hidden tool details out of responses.
- Require explicit confirmation for payments, refunds, destructive changes, permission changes, external messages, or other consequential actions if ever allowed.
- Sanitize model output before rendering and do not execute generated code/HTML/SQL.
- Apply per-user/business quotas, timeouts, token limits, concurrency controls, and circuit breakers.

## Privacy, governance, and operations

Before production use, decide and document:

- LLM and embedding providers, regions, data residency, training/data-use terms, and subprocessors.
- Data minimization, consent/notices, personal/sensitive data handling, and deletion.
- Prompt, response, trace, chat, vector, and source-document retention.
- Human oversight and complaint/correction pathways.
- Model/version change control and rollback.
- Cost budgets, quotas, availability fallback, and incident response.
- Audit access and separation of operational telemetry from sensitive conversation content.

All are **Decision Required**.

## Evaluation and acceptance direction

AI phases must define versioned evaluation datasets without production secrets, including expected answerability, source grounding, citations, permission boundaries, refusal, injection resistance, tool correctness, latency, and cost. Evaluation should combine automated checks with human review. Model output is probabilistic, so phase completion depends on agreed thresholds and monitored failure modes, not anecdotal demos.

