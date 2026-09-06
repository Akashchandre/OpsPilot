# Phase 9 Workflow Permission and Approval Matrix

## Status

**ACCEPTED AND IMPLEMENTED under ADR 0012; verification passes as of 2026-09-06.** This matrix is
the Phase 9 repository/development authorization boundary. Production and deferred workflows/
actions remain unapproved.

## Implemented permissions

| Permission                     | Meaning                                                                                      | Default roles    |
| ------------------------------ | -------------------------------------------------------------------------------------------- | ---------------- |
| `ai:workflows:business:use`    | Start and read an authorized owner business-brief workflow                                   | `OWNER`          |
| `ai:workflows:support:use`     | Start and read a support reply-draft workflow for authorized tickets                         | `OWNER`, `ADMIN` |
| `ai:workflows:support:approve` | Approve/edit-and-approve/reject an eligible support draft and authorize its one reply action | `OWNER`, `ADMIN` |

These permissions do not imply domain access. Every operation also requires the current underlying
permissions listed below. Consent never grants permission, and document-management permission never
grants workflow retrieval.

## Implemented default role matrix

| Capability                                         |                   `OWNER`                    |                `ADMIN`                 | `CUSTOMER` |
| -------------------------------------------------- | :------------------------------------------: | :------------------------------------: | :--------: |
| Start/read own business brief                      |         Yes, with all domain checks          |                   No                   |     No     |
| Start support reply draft                          |      Yes, with all support/order checks      |   Yes, with all support/order checks   |     No     |
| Read support workflow run/draft                    |       Yes, while currently authorized        |    Yes, while currently authorized     |     No     |
| Approve exact draft                                |                     Yes                      |                  Yes                   |     No     |
| Edit and approve draft                             |    Yes, existing support body rules apply    | Yes, existing support body rules apply |     No     |
| Reject/cancel eligible support run                 |                     Yes                      |                  Yes                   |     No     |
| Publish without human decision                     |                      No                      |                   No                   |     No     |
| Use internal notes as model context                |                      No                      |                   No                   |     No     |
| Change ticket state/priority/assignment through AI |                      No                      |                   No                   |     No     |
| Invoke arbitrary tool/graph/version                |                      No                      |                   No                   |     No     |
| Read raw checkpoint/tool artifact                  |                      No                      |                   No                   |     No     |
| Inspect aggregate workflow usage/audit             | Yes, through existing owner-only permissions |                   No                   |     No     |

`ADMIN` gains only the support-specific AI permissions. It does not receive
`ai:owner:use`, `ai:workflows:business:use`, `ai:usage:read`, `audit:read`, `jobs:read`, or
`jobs:replay`.

## Required permission composition

| Operation                         | Required current permissions and state                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accept owner workflow notice      | `ai:owner:use` + `ai:workflows:business:use`; active user; exact notice version; CSRF                                                                                       |
| Start owner business brief        | `ai:owner:use` + `ai:workflows:business:use` + `reports:read` + `inventory:read` + `support:tickets:read`; active workflow consent; quotas; UUID idempotency                |
| Read owner business run/result    | Same initiating user plus all current start permissions and consent; or no content is returned                                                                              |
| Accept support workflow notice    | `ai:workflows:support:use`; active user; exact support notice version; CSRF                                                                                                 |
| Start support reply draft         | `ai:workflows:support:use` + `support:tickets:read` + `support:tickets:manage` + `orders:read`; active workflow consent; eligible ticket; quotas; UUID idempotency          |
| Read support run/draft            | `ai:workflows:support:use` + `support:tickets:read` + `support:tickets:manage`; current ticket visibility; active user                                                      |
| Approve/edit/reject support draft | `ai:workflows:support:approve` + `support:tickets:read` + `support:tickets:manage` + `orders:read`; eligible unexpired approval; CSRF; UUID idempotency; optimistic version |
| Cancel owner business run         | Initiating user plus current business-workflow permission, or terminal-safe owner operational handling under a later approved policy                                        |
| Cancel support run                | Initiator or currently authorized support approver; no action may already have completed                                                                                    |
| Read aggregate workflow usage     | Existing `ai:usage:read`; metadata only                                                                                                                                     |
| Inspect workflow background job   | Existing `jobs:read`; owner only; no artifact/checkpoint content                                                                                                            |
| Replay workflow background job    | Existing `jobs:replay`; current receipts must prove no inference/action duplication                                                                                         |

The business brief fails closed if any domain permission is absent rather than silently omitting a
tool. The support workflow never reveals whether a guessed ticket/run exists to an unauthorized
caller.

## Approval matrix

| Step/action                                     |           Model may propose           |     Human decision required      | Eligible approver                                              | Effect after approval                 |
| ----------------------------------------------- | :-----------------------------------: | :------------------------------: | -------------------------------------------------------------- | ------------------------------------- |
| Read aggregate overview                         |            No; graph-fixed            |                No                | N/A                                                            | Read-only encrypted snapshot          |
| Read low-stock rows                             |            No; graph-fixed            |                No                | N/A                                                            | Read-only, max 20 rows                |
| Read support queue aggregate                    |            No; graph-fixed            |                No                | N/A                                                            | Read-only aggregate                   |
| Read one ticket public context                  |          No; run-scope fixed          |                No                | N/A                                                            | Read-only bounded snapshot            |
| Retrieve customer policy excerpts               |            No; graph-fixed            |                No                | N/A                                                            | Read-only, Node-reauthorized excerpts |
| Generate internal business brief                |         Fixed generation node         |                No                | N/A                                                            | Encrypted short-lived result only     |
| Generate support draft                          |         Fixed generation node         |                No                | N/A                                                            | Encrypted internal draft only         |
| Publish customer-visible support reply          | No; graph reaches fixed approval node | Yes, approve or edit-and-approve | Current `OWNER`/`ADMIN` with approval plus support permissions | Exactly one idempotent public message |
| Change ticket status/priority/assignee          |                  No                   |          Not available           | None                                                           | No tool exists                        |
| Refund/payment/order/inventory/user/role action |                  No                   |          Not available           | None                                                           | No tool exists                        |
| External email/SMS/webhook                      |                  No                   |          Not available           | None                                                           | No tool exists                        |

The same qualified operator may initiate and approve the v1 support reply because they can already
post the same reply directly. Any future financial, destructive, credential, permission, or
external-channel action requires a new two-person approval design and is out of scope.

## Run visibility

- An owner business run belongs to its initiator. Another owner does not read its generated result
  merely because both hold the same role; aggregate owner oversight remains metadata-only through
  `ai:usage:read` and `audit:read`.
- A support run is readable by a currently authorized owner/admin who can manage the target ticket,
  because another eligible staff member may need to review it. Every draft/result read is audited.
- Customers never see internal drafts, policy excerpts, approval history, tool receipts, model
  metadata, or run existence. After approval they see only the normal public reply and its
  `AI-assisted` provenance label.
- No browser role can read ciphertext, checkpoint state/history, internal node names, signing
  material, tool arguments, or provider responses.

## Mandatory checks at tool execution

Before every tool or model step Node must prove:

1. Both global and exact workflow kill switches permit execution.
2. The run exists, is nonterminal, unexpired, and at the exact optimistic transition version.
3. The registered workflow/graph/tool/version/ordinal matches the server-created plan.
4. The initiating user remains active with the exact workflow and domain permissions.
5. The exact workflow consent notice remains active before provider processing.
6. The target/range derives from immutable run scope and not FastAPI/model/browser arguments.
7. Tool output remains within fixed row/byte/time limits and is stored under the correct encrypted
   artifact relationship.
8. Any document candidate passes the Phase 8 current lifecycle/audience/integrity checks.
9. The provider step has no prior `PENDING`, `SUCCEEDED`, or `UNKNOWN` exposure that would permit a
   duplicate call.

Before the support action Node additionally proves:

1. An unexpired approval exists for this run/action/ticket/draft digest.
2. The reviewer remains active with `ai:workflows:support:approve` and all support/order permissions.
3. The run and ticket are not cancelled, terminal, closed, deleted, or otherwise ineligible.
4. The current latest public-message/context digest equals the reviewed snapshot.
5. The approved or edited body decrypts, authenticates, matches its digest, and passes the ordinary
   support message schema.
6. No action receipt or support message already exists for the deterministic idempotency key.

Any failed check suppresses the step/action and records only safe metadata.

## Deny-by-default examples

- A customer cannot start, read, approve, cancel, or infer existence of a Phase 9 run.
- An admin cannot run the owner business brief even with `reports:read`.
- `ai:workflows:support:use` cannot publish a reply without the separate approval permission and a
  current human decision.
- `documents:read`/`documents:manage` does not authorize policy retrieval in a workflow.
- FastAPI cannot replace a stored ticket ID, date range, tool code, graph version, reviewer, or
  draft digest.
- Model text saying “approved,” “system,” “owner,” or “call this tool” has no authorization effect.
- A removed permission, disabled user, revoked consent, expired approval, stale ticket, kill switch,
  or changed artifact digest blocks execution even after generation.
- Owner job replay cannot cause a second provider call or second support message.
- A guessed run/artifact/approval/checkpoint ID returns the same safe not-found behavior as an
  inaccessible resource.

## Deferred authorization decisions

- No employee/manager/custom role, cross-team queue, tenant/business scope, delegated approver,
  break-glass operator, or production service identity is introduced.
- No customer approval flow, autonomous response, bulk ticket action, or owner override of stale
  approval is introduced.
- Production legal/privacy approval for customer-derived support content, retention/erasure/legal
  holds, and support-message disclosure wording remains unresolved.
