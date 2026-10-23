# Phase 4 S2-B｜LINE step-up + Passkey registration HTTP（feature gated）

> Status 2026-10-24: **Draft only. Registered route handlers exist in branch, but flag is OFF by default**. No UI and no Remote D1 migration applied. **Do not enable in Production/Preview yet**.
> Stack: Draft #346 → Draft #347 → Draft #348 → this PR.
> Production main remains S1 `21b890c1ebd70fcc6069b64c84d3bf4c063603b3`.

## Runtime contract / functionality

The `worker.ts` dispatcher delegates to `handleS2BPasskeyRequest` **before** normal LINE callback processing. Unless `PASSKEY_REGISTRATION_ENABLED === "true"`, it returns null without modifying existing behavior. **No flag is added to `wrangler.jsonc`**. The routes remain disabled in normal deployed environments even if code is reviewed and merged later.

| Endpoint | Method | Expected behavior when enabled |
| --- | --- | --- |
| `/api/auth/passkey/stepup/start` | POST | Requires **valid existing signed/authVersion Session**, production-fixed request Origin, JSON request, linked LINE identity; rate-limits starts. Generates `prompt=login&max_age=0` URL with existing LINE callback, stores hashed state+session binding. Clears prior proof Cookie |
| `/api/auth/line/callback?state=s2b_...` | GET | Dedicated dispatch if feature enabled and S2-B prefix. Same signed session and hashed browser cookie; state claimed once, official LINE code/ID-token verification with nonce and freshness; LINE subject mapped to same existing User. Redirects to `/?passkey_stepup=verified` with short `HttpOnly; Secure; SameSite=Strict` proof Cookie. Does not issue normal login Cookie |
| `/api/auth/passkey/register/options` | POST | Same-origin, signed Session, valid same-browser unconsumed proof, returns WebAuthn options using S2-A persisted challenge and S2-B existing-User registration helper |
| `/api/auth/passkey/register/verify` | POST | Same restrictions, bounded JSON, consumes the short-lived proof **before** credential registration; then verifies full WebAuthn response and consumes challenge once before globally unique credential insert. Clears proof Cookie after successful registration. Failed verify requires user to restart LINE reauthentication |

The current-account proof never substitutes for a generic login and cannot create a new User/Player/Group or modify Score.

## Security gates before enabling or deploying

1. Real LINE account `prompt=login` → callback testing (ID-token `auth_time`, `amr`, same User identity) with the **real registered redirect URI**. The official `amr` field may be missing depending on authentication method; fail closed until a supported method is confirmed and reviewed.
2. Confirm feature flag is **OFF** in both Wrangler and Cloudflare effective vars unless explicit enable approval. A merged Worker with a flag accidentally set would expose these endpoints; therefore **inspect effective vars and deploy rules** as part of separate approval.
3. Add browser/UI (including CSRF origin, user-facing recovery for proof expiration and session sliding) and Android/iOS registration tests on an **isolated Worker/Preview D1**, not Production.
4. Review OAuth callback's signed-session fingerprint behavior if the Cookie gets renewed during redirect (expected fail-closed but UX recovery required), different LINE identity and duplicate callbacks, provider errors, no token logging.
5. Enforce per-user/per-IP rate limit in a production-compatible manner and audit failures; current DB count is non-atomic and only a basic per-User throttle. Protect even high-volume malicious starts, line token endpoints and registration options.
6. Validate end-to-end `verifyRegistrationResponse` with real authenticator and `passkey_credentials` BLOB/UNIQUE, explicit freshness+rate limits+audit. The current test suite's fake provider does **not** prove a live LINE registration, and S0 PoC did not issue app sessions.
7. Explicit Human authorization for S2-A/B staged merge, additive D1 `0012` Production/Preview application, Worker deploy/flag enable. **Main push triggers automatic Production deploy**: do not merge during local-only phase.

## Automated contract tests

- `tests/passkey-http.test.ts`: feature-off behavior, no-Cookie 401, wrong/missing Origin 403, POST/JSON constraints, enabled start with existing LINE user, no proof on options/verify 403, no User/Player/Score queries or writes.
- `tests/passkey-line-stepup.test.ts`: fake-provider nonce/audience/subject/auth_time/replay, no secrets logged.
- `tests/passkey-line-stepup-d1.test.ts`: isolated Wrangler `--local` D1 one-shot claim/proof/schema constraints.
- CI lint/test/build, migration safety and existing-data regression required. **All actual remote Cloudflare steps must remain skipped**.

The user cannot operate Cloudflare CLI; do not send them manual commands. Use authorized GitHub workflow checks if future Human approval permits Remote preflight, never without data preservation gates.

Official source: https://developers.line.biz/ja/docs/line-login/integrate-line-login/ and https://developers.line.biz/ja/reference/line-login/
