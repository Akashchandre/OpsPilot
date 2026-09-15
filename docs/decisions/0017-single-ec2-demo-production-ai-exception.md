# ADR 0017 — Single-EC2 Demo Production AI Exception

## Status

Accepted on 2026-09-15 by the owner’s explicit instruction to enable every implemented AI
capability in production and subsequent confirmation accepting the current single-EC2 fictional-
data demo, its local persistence/no-HA/no-backup limitations, and the unresolved AI-image critical/
high findings.

This is a narrow exception for the ADR 0014 personal demo. It does not approve the local topology
for a commercial or real-data production system and does not replace ADR 0013’s managed production
target.

## Context

The deployed demo intentionally returned `AI_DISABLED` and `AI_WORKFLOWS_DISABLED` because ADRs
0013 and 0014 launched with AI, documents, RAG, and workflows off. Focused verification on
2026-09-15 passed the web AI, Node integration, and Python AI/RAG/workflow suites, confirming that
the observed messages were kill-switch behavior rather than implementation failures.

Enabling everything means enabling:

- customer help and owner overview explanation through Groq;
- encrypted owner/admin document management and permission-aware document Q&A;
- the owner business-brief workflow; and
- the owner/admin support reply workflow, including bounded fictional support conversation and
  policy excerpts sent to Groq after explicit consent and mandatory human approval.

The current `t3.small` demo cannot host the managed S3/Qdrant/durable-checkpoint topology from ADR
0013 within the accepted no-new-paid-service profile. It can reuse the already implemented local
encrypted filesystem, embedded Qdrant, and strict SQLite checkpoint boundaries on encrypted EBS,
with the availability and recovery limitations explicitly accepted by the owner.

Groq’s current documentation states that ZDR can be enabled in Data Controls, usage metadata is
still retained, and customer data may be processed in the United States. Qdrant documents its
client local mode as suitable for small-scale testing/debugging rather than a normal production
deployment. These limitations reinforce the demo-only scope.

## Decision

- Add `AI_PRODUCTION_DEMO_LOCAL_TOPOLOGY_ACCEPTED=true` as a required explicit guard in both Node
  and FastAPI before local AI/document/workflow persistence is allowed with a production runtime.
  Every other production configuration continues to fail closed.
- Enable all existing capability flags only in the ADR 0014 Compose overlay. Retain independent
  kill switches for base AI, documents/RAG, workflows, business briefs, and support workflows.
- Keep FastAPI loopback-only inside the API container’s network namespace. No AI, vector,
  checkpoint, tool, or document-storage port is published or routed through Nginx/CloudFront.
- Bake the exact reviewed FastEmbed revision into the AI image and verify its accepted artifact
  hashes during the image build, so runtime model downloads remain disabled. Use distinct private
  named volumes for encrypted document objects, embedded Qdrant data, and strict metadata-only
  SQLite checkpoints. Both runtime images pre-create their mount roots for their non-root
  identities.
- Use distinct canonical 32-byte Base64 secrets and identifiers for Node-to-AI signing, AI-to-Node
  signing, document encryption, workflow-artifact encryption, and audit integrity. The dedicated
  Groq key is visible only to the AI container. Secret values remain in the ignored mode-`0600`
  `demo.env` file and must never be printed by validation or smoke scripts.
- Require Groq ZDR confirmation, existing versioned end-user consent, fixed model/prompt contracts,
  quotas and cost ceilings, permission checks, citation reauthorization, metadata-only usage, and
  mandatory approval before the support workflow publishes a reply.
- Permit only fictional, disposable demo inputs. Real personal, customer, regulated, confidential,
  credential, payment, or production business data remains prohibited even when a user ignores the
  visible warning.
- Accept the current AI image’s unresolved `3C/11H` scan result for this demo only. The acceptance
  expires at the earlier of demo teardown, AWS credit/Free Plan exhaustion, or 2026-11-15. It does
  not waive the ADR 0013 release gate or permit suppressing scanner output.
- Treat the local volumes as non-HA and not backed up. Document/vector/checkpoint inconsistency or
  host loss may require deleting fictional data and reingesting documents. MySQL remains the
  authority for lifecycle, authorization, runs, usage, and audit evidence.

## Verification and rollout

Before deployment, the complete regression, formatting/lint/schema, production build, Compose
render, container startup, non-root volume-write, provider/ZDR preflight, AI/document/workflow
health, deterministic AI gates, and public smoke must pass. Deployment remains tied to an exact
reviewed commit and data-preserving script. A metered live inference smoke must use synthetic input
only and record no prompt, answer, secret, or provider body.

Immediate rollback sets the capability flags false in dependency order, recreates API/worker/AI,
and confirms core health remains available. Do not delete named volumes during rollback.

## Consequences

- The public personal demo can exercise every implemented AI path while preserving the existing
  authorization, consent, provider, tool, and approval boundaries.
- Startup now depends on FastEmbed model availability/cache, embedded Qdrant integrity, SQLite
  checkpoint access, and Groq readiness. On the 2 GiB host this may cause slow startup, swapping,
  throttling, or safe AI unavailability while core routes remain available.
- Local state has no replication, point-in-time recovery, multi-instance locking, or HA claim.
- Public users can disregard the fictional-data warning; operators must revoke access and disable
  AI if real or sensitive content is observed.
- A real-data/commercial rollout still requires the ADR 0013 managed topology, privacy/retention/
  legal review, resolved image findings, backup/restore, monitoring/alerts, capacity testing, and a
  new explicit release decision.

Repository build/runtime evidence is recorded in
`docs/phase-10/PHASE-10-ADR-0017-AI-DEMO-EVIDENCE.md`.

## Related decisions

- `docs/decisions/0010-phase-7-groq-provider.md`
- `docs/decisions/0011-phase-8-rag-document-baseline.md`
- `docs/decisions/0012-phase-9-langgraph-workflow-baseline.md`
- `docs/decisions/0013-phase-10-production-readiness-baseline.md`
- `docs/decisions/0014-single-ec2-cloudfront-personal-demo.md`
