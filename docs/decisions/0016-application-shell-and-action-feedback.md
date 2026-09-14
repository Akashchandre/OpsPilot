# ADR 0016 — Application Shell and Action Feedback

## Status

Accepted on 2026-09-14 by the owner's request for an industry-level application interface,
consistent headers, top navigation, cards, warnings, and Toastify feedback for application
actions.

## Context

OpsPilot already had complete customer and operator routes, permission-aware navigation, inline
loading and error states, and a persistent Test Mode warning. The growing feature set made the
single-row navigation crowded, while action feedback varied by page. The refinement must preserve
the existing React/Express architecture, authorization boundaries, Test Mode/no-real-money
labelling, and accessible inline state.

A toast system adds value for deliberate mutations and failures but should not create noise for
passive navigation, pagination, background notification reads, or routine data loading. Toasts
also cannot replace durable page state or form-level error guidance.

## Decision

- Keep the existing React and plain-CSS foundation. Refine the shared application shell, headers,
  cards, responsive layout, focus treatment, footer, product presentation, dashboard shortcuts,
  and checkout warning without introducing a component framework.
- Group secondary customer and operator routes into responsive navigation menus. Continue deriving
  operator visibility from the existing permission set; the API remains the security boundary.
- Add exact `react-toastify@11.1.0`. It is MIT-licensed, supports the pinned React 19 runtime, has
  no account or environment-variable requirement, and adds only its existing `clsx` dependency.
- Mount one accessible, bounded, deduplicating toast container in the application shell.
- Emit contextual success or failure feedback centrally for deliberate `POST`, `PUT`, `PATCH`, and
  `DELETE` API calls. Permit call sites to suppress or override feedback for background or
  specialized behavior.
- Keep existing inline errors and authoritative destination-page messages. Do not toast passive
  links, filters, pagination, or routine reads solely because a button was clicked.
- Preserve the persistent `TEST MODE — NO REAL MONEY · FICTIONAL DATA ONLY` banner and add a
  checkout-specific warning. Payment cancellation, provider failure, and unavailable-checkout
  states use warning feedback and remain Test Mode only.

## Consequences

- Customer and operator routes share a clearer responsive hierarchy and consistent action
  feedback without changing APIs, database schema, roles, or permissions.
- Central mutation feedback applies to current and future API actions, with a safe generic fallback
  when no domain-specific message exists.
- Inline state remains necessary for accessibility, validation, recovery, and durable context;
  Toastify is transient enhancement only.
- The web production bundle gains one small client dependency. Dependency consistency, audit,
  coverage, and production-build gates must continue to run for changes to this boundary.

## Related decisions

- `docs/decisions/0001-phase-1-toolchain.md`
- `docs/decisions/0013-phase-10-production-readiness-baseline.md`
- `docs/decisions/0014-single-ec2-cloudfront-personal-demo.md`
- `docs/decisions/0015-static-catalog-imagery-and-public-labelling.md`
