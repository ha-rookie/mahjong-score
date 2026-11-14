# Phase 4 P1: existing LINE User self-service passkey enrollment (#360)

## Scope and dependency
- Feature: signed-in LINE User adds passkey to **same** User ID from account menu. Subsequent authentication uses P0 #358 passkey login flow.
- This is a **stacked branch on unmerged Draft PR #358**. Invite enrollment and admin-guided existing User recovery remain unchanged.
- No change to User ID, Player, Group, Session, Game, Score, LINE external identity, or existing signed session.
- Reuse security-reviewed S2-B modules from earlier Draft PR #353; do not merge the old stacked PRs.

## Architecture and guardrails
- `PASSKEY_REGISTRATION_ENABLED` is disabled when unset. No deployment or configuration change is part of this PR.
- Only a logged-in, authVersion-validated LINE User may start a same-origin POST to initiate recent LINE OAuth reauthentication (prompt=login, max_age=0).
- A newly verified ID token must map to the same existing User via LINE subject and nonce. A server-stored, single-use HttpOnly proof is bound to the original signed browser session.
- Credential registration uses a hashed D1 one-shot WebAuthn challenge, fixed server RP/Origin, P-256 UV verification and existing User's credential list. No new User / Player creation and no permission migration.
- After LINE callback, frontend checks recent proof status from server; the URL marker is never an authentication assertion.
- Additive local database migration `0013_passkey_line_stepup.sql`; existing parent 0012 and all prior migrations are untouched.
- There are distinct P0 and P1 environment selectors; both must be reconciled to the same intended host during release review.

## Release gates
- Validate lint/test/build, local D1 migrations, existing data regression and old LINE + invite flows.
- Actual Android Chrome and iPhone Safari enrollment validation must be recorded separately; no live-app proof is claimed by simulated CI.
- Review session binding, origin/CSRF, token freshness, challenge replays, credential uniqueness, D1 authorization and disabled-by-default flag.
- **No approval for main merge, Remote D1, Secrets, vars, UAT or Production deploy**. Do not enable the flag for users until P0 #358 has merged and an explicit later release authorization.

## November 14, 2026 — authentication integration fixes
- **P0/P1 RP parity:** P1 now uses the P0 `PASSKEY_ENV` selector, with only the fixed Production or Android UAT host. Obsolete `PASSKEY_AUTH_ENVIRONMENT` / `PASSKEY_PREVIEW_ORIGIN` selectors are rejected; Android UAT still requires a distinct, separately configured LINE channel. No environment variable was changed.
- **LINE documented optional `amr`:** Official LINE Login token contract says this claim can be absent (https://developers.line.biz/en/reference/line-login/). Accept an omitted claim only while retaining prompt=login / max_age=0, verified recent `auth_time`, issuer, audience, nonce, one-time state, and same-user identity; reject explicit `lineautologin`, unknown or empty arrays.
- **Cookie renewal:** `/api/auth/me` defers sliding cookie renewal only during a verified, same-user, same-browser, unconsumed P1 step-up proof (maximum five minutes). Otherwise, including flag off, it retains normal sliding renewal. Tests exercise both cases.
- **Release remains blocked:** Android Chrome end-to-end acceptance, separate LINE UAT channel registration and explicit approval are not completed. No deploy, remote D1, configuration or secret changes.
