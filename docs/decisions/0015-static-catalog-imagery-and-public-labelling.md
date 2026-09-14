# ADR 0015 — Static Catalog Imagery and Public Labelling

## Status

Accepted on 2026-09-14 by the owner's request to remove visible demo naming, add images to the
current production catalog, and remove the longer notice shown beneath the application header.

## Context

ADR 0004 deliberately deferred managed product images, uploads, arbitrary remote image URLs, and
object storage because those capabilities require schema, authorization, content-validation,
malware, privacy, retention, and delivery decisions. The deployed catalog therefore used a
deterministic initials placeholder.

The current public catalog contains eleven fictional furniture products. The requested visual
upgrade does not require a general product-media system or an upload workflow. The Razorpay Test
Mode and fictional-data warnings remain mandatory under ADRs 0013 and 0014 even though the word
`Demo` is removed from public presentation.

## Decision

- Bundle one optimized static JPEG for each of the eleven current catalog products in the React
  public assets.
- Resolve those assets client-side from the existing immutable SKU. Do not add an API field,
  database column, upload route, arbitrary file path, remote URL, object store, or dependency.
- Render meaningful product-name alternative text, lazy-load catalog-card images, prioritize the
  product-detail image, and retain the initials placeholder when no approved mapping exists or an
  asset fails to load.
- Remove `Demo` from the ten affected live product names and descriptions. Preserve immutable SKU
  values and historical identity; remove the internal `DEMO-` prefix only from public SKU
  presentation.
- Replace the two-part public banner with one concise persistent label:
  `TEST MODE — NO REAL MONEY · FICTIONAL DATA ONLY`.
- Keep the managed product-image/upload capability deferred. A future operator-editable image
  feature still requires a separately accepted schema, storage, validation, authorization,
  security, retention, and operations design.

## Consequences

- The current catalog gains consistent product photography without widening the public API or
  accepting untrusted media.
- New or renamed SKUs safely fall back to initials until a reviewed static asset mapping is added.
- Static SKU-to-asset mappings are presentation data and must be updated with catalog changes.
- The shorter production label preserves the Test Mode, no-real-money, and fictional-data safety
  requirements while removing the visible `Demo` wording and explanatory sentence.

## Related decisions

- `docs/decisions/0004-phase-3-business-core.md`
- `docs/decisions/0013-phase-10-production-readiness-baseline.md`
- `docs/decisions/0014-single-ec2-cloudfront-personal-demo.md`
