# Changelog

## Unreleased

- **Breaking:** require `@polar-sh/sdk` 1.x (API version `2026-10`). The 0.x SDK
  entry points (`@polar-sh/sdk/core.js`, `/funcs/*`, `/webhooks`,
  `/models/components/*`) no longer exist.
  - Webhook payloads passed to `events` handlers (and the deprecated `on*`
    callbacks) use the SDK's snake_case fields with ISO string timestamps, e.g.
    `event.data.customer_cancellation_reason` instead of
    `event.data.customerCancellationReason`.
  - `createCheckoutSession`, `changeSubscription` and `cancelSubscription`
    return snake_case SDK objects.
  - Data stored by the component is unchanged (still camelCase); no migration
    needed.

## 0.9.2

- Update ctx types for convex@1.41+

## 0.9.1

- feat: Add returnUrl parameter to Customer Portal session (#66) @empz

## 0.9.0

- feat: update SDK to version 0.45.0 and add support for new subscription types
  (#50) @candidosales
- feat: Add locale option for generateCheckoutLink method (#47) @candidosales

## 0.8.1

- feat: add typesafe webhook event handlers with full type inference for all 30+
  Polar webhook events
- fix: prevent potential auth token leakage in SDK error logging
- fix: handle "customer already exists" error when users recreate their account

## 0.8.0

- feat: add trial subscription support with lazy checkout mode
- feat: support new Polar price types (custom, seat-based, metered unit) and
  product benefits
- feat: add optional metadata prop to CheckoutLink for passing custom data to
  checkout sessions
- fix: add webhook resilience with upsert semantics and timestamp guards
- fix: generic type parameter in README example
- chore: update dependencies

## 0.7.3

- update scripts and config files

## 0.7.1

- update dependencies and build output

## 0.7.0

- Adds /test and /\_generated/component.js entrypoints
- Drops commonjs support
- Improves source mapping for generated files
- Changes to a statically generated component API
