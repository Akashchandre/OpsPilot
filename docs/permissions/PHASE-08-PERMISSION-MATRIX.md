# Phase 8 Document and RAG Permission Matrix

## Status

**ACCEPTED on 2026-09-05 under ADR 0011.** The user approved this matrix with the complete Phase 8
baseline. Database and application implementation is now in progress.

## Proposed permissions

| Permission         | Meaning                                                                                                 | Default roles    |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ---------------- |
| `documents:read`   | List document metadata/version state and read an original authorized document through the protected API | `OWNER`, `ADMIN` |
| `documents:manage` | Create metadata, upload immutable versions, archive/restore eligible documents, and request reindex     | `OWNER`, `ADMIN` |
| `documents:delete` | Request lifecycle deletion of a document, encrypted originals, chunks, and vectors                      | `OWNER`          |

Existing assistant permissions remain separate:

- `ai:customer:use` permits the customer document-Q&A path only when the user also has current
  document-processing consent. It never grants document management or arbitrary source selection.
- `ai:owner:use` permits the owner document-Q&A path only when the user also has current
  document-processing consent. The document path does not require `reports:read`; the existing
  owner overview explanation continues to require it.
- `ai:usage:read` remains owner-only metadata visibility and does not reveal document text,
  questions, answers, excerpts, vectors, or filenames.
- `jobs:read` and `jobs:replay` remain owner-only. A replay must still pass the current document
  lifecycle and descriptor checks.

## Proposed default role matrix

| Capability                                                           |                       `OWNER`                       | `ADMIN` |                       `CUSTOMER`                       |
| -------------------------------------------------------------------- | :-------------------------------------------------: | :-----: | :----------------------------------------------------: |
| List document metadata and version status                            |                         Yes                         |   Yes   |                           No                           |
| Read an original document through the protected management API       |                         Yes                         |   Yes   |                           No                           |
| Create a logical document and upload a version                       |                         Yes                         |   Yes   |                           No                           |
| Select `CUSTOMER` and/or `OWNER` audience on a new immutable version |                         Yes                         |   Yes   |                           No                           |
| Archive or request reindex                                           |                         Yes                         |   Yes   |                           No                           |
| Delete document content/vectors                                      |                         Yes                         |   No    |                           No                           |
| Use customer document Q&A                                            |                         No                          |   No    | Yes, with `ai:customer:use` and current scoped consent |
| Use owner document Q&A                                               | Yes, with `ai:owner:use` and current scoped consent |   No    |                           No                           |
| Retrieve `CUSTOMER` audience through RAG                             |                         Yes                         |   No    |                          Yes                           |
| Retrieve `OWNER` audience through RAG                                |                         Yes                         |   No    |                           No                           |
| View citation excerpt from a completed authorized request            |    Own currently authorized assistant scope only    |   No    |     Own currently authorized assistant scope only      |
| View aggregate AI usage/cost evidence                                |                         Yes                         |   No    |                           No                           |
| Inspect/replay document jobs                                         |                         Yes                         |   No    |                           No                           |

`ADMIN` can manage approved documents as described by the product overview but has no assistant
permission. Management access is not model/retrieval access. `CUSTOMER` has no document collection,
original-file, version-history, ingestion-status, reindex, or delete access.

## Audience rules

| Version audience     | Customer document assistant                                       | Owner document assistant         | Admin management API              |
| -------------------- | ----------------------------------------------------------------- | -------------------------------- | --------------------------------- |
| `CUSTOMER`           | Allowed after all current checks                                  | Allowed after all current checks | Read/manage allowed by permission |
| `OWNER`              | Denied                                                            | Allowed after all current checks | Read/manage allowed by permission |
| `CUSTOMER` + `OWNER` | Customer sees only the same approved version; no additional scope | Allowed                          | Read/manage allowed by permission |

Audiences are immutable for a version. Any audience change creates and publishes a new version.
There is no browser-supplied arbitrary audience, user list, role list, tenant ID, or vector filter.
Node derives the exact retrieval audience from the registered assistant path.

## Proposed endpoint and service mapping

| Operation                                           | Required checks                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/documents` and document/version detail | Active session + `documents:read`; bounded pagination; safe metadata only                                                                  |
| `POST /api/v1/documents`                            | Active session + `documents:manage` + trusted origin + CSRF + UUID idempotency key                                                         |
| `PATCH /api/v1/documents/:documentId`               | Active session + `documents:manage` + trusted origin + CSRF + optimistic version                                                           |
| `POST /api/v1/documents/:documentId/versions`       | Active session + `documents:manage` + trusted origin + CSRF + UUID idempotency key                                                         |
| `PUT .../versions/:versionId/content`               | Active session + `documents:manage` + creator/eligible-draft check + trusted origin + CSRF + UUID idempotency key + strict raw-body policy |
| `GET .../versions/:versionId/content`               | Active session + `documents:read` + current management permission recheck; audited protected response                                      |
| `POST .../versions/:versionId/reindex`              | Active session + `documents:manage` + trusted origin + CSRF + UUID idempotency key + eligible lifecycle state                              |
| `DELETE /api/v1/documents/:documentId`              | Active session + `documents:delete` + trusted origin + CSRF + UUID idempotency key + optimistic version                                    |
| Document-consent read/accept/revoke                 | Active session; assistant-scoped ownership; accept additionally requires the exact assistant permission; writes require CSRF               |
| Customer document response                          | Active session + `ai:customer:use` + active customer document consent + quota/cost/concurrency gate + at-most-once key                     |
| Owner document response                             | Active session + `ai:owner:use` + active owner document consent + quota/cost/concurrency gate + at-most-once key                           |
| Citation excerpt                                    | Same user as usage event + same assistant permission + current consent + current source audience/READY/active check                        |
| Worker ingest/reindex/delete                        | Registered job descriptor + current eligible version state; no browser authority carried in payload                                        |
| FastAPI index/retrieve/publish/delete/generate      | Valid signed internal request + registered contract; never treated as end-user authorization                                               |

## Mandatory source-use checks

Before document text becomes Groq context, Node must prove all of the following in one current
authorization pass:

1. The session user is active.
2. The exact assistant-use permission is still present.
3. The exact document-processing consent version is active.
4. The logical document is `ACTIVE`.
5. The version is the document's current active version and is `READY`.
6. The immutable version audience is permitted for the registered assistant.
7. The candidate chunk belongs to that version and its point ID, byte range, and checksum match
   MySQL metadata.
8. The decrypted source object authenticates and its normalized checksum matches the version.
9. The selected context stays within fixed chunk/byte/token limits.

All checks are repeated after provider completion for permission, consent, document/version state,
audience, and citation identity. Any change in flight suppresses the complete answer.

## Deny-by-default examples

- A customer cannot retrieve an `OWNER` version even by guessing document, version, chunk, point,
  or citation IDs.
- An admin with `documents:manage` cannot call a customer or owner assistant.
- An owner assistant permission does not grant original-file management access without
  `documents:read`.
- A manager cannot upload an arbitrary audience, make a draft/failed version active, or directly
  set lifecycle/vector fields.
- A stale Qdrant payload cannot authorize source text; Qdrant candidates are reauthorized through
  MySQL before model use.
- Revoked consent, disabled users, removed permissions, archived/deleting documents, superseded
  versions, deleted chunks, and checksum failures suppress output.
- Job replay never bypasses current lifecycle, permission-independent descriptor validation, or
  idempotency.
- Citation access is not a general document lookup route and never returns a source that is no
  longer authorized.

## Deferred authorization decisions

- No employee/manager role, custom document audience, team, department, customer-specific source,
  tenant/business row, public anonymous document access, share link, or external collaborator is
  introduced.
- No admin AI access is implied by document management.
- Production break-glass, legal-hold, backup-administrator, and object/vector operator roles remain
  undecided.
