# Phase 4 S2-B｜パスキー登録UI（サーバー機能フラグ管理）

> 2026-10-24: **Draft UI/Browser integration only**. No main merge, Remote D1 migration or Cloudflare deployment. PR #349 is its unmerged parent. The UI must remain hidden unless the **server** replies `registrationEnabled: true`; it cannot be activated from a URL or browser preference.

## Purpose

Provide an account-menu entry to start a fresh LINE step-up and then register a passkey, while leaving existing LINE sessions, Player/Group/Score and invitations untouched. No passkey **login** exists in this phase.

## User flow (not yet real-device accepted)

1. After signed-in `/api/auth/me` succeeds, `PasskeyEnrollment` calls **read-only** `GET /api/auth/passkey/capabilities`. By default the server has no `PASSKEY_REGISTRATION_ENABLED=true` and responds `{registrationEnabled:false}`, so this component renders **nothing**.
2. After a separately reviewed *test-environment* flag enablement, account menu adds a small button. A user gesture POSTs `/api/auth/passkey/stepup/start`. Only an allowlisted `https://access.line.me/oauth2/v2.1/authorize` URL with `prompt=login,max_age=0` is navigated to. No access token/nonce/secret is put in client state.
3. LINE callback sets an **HttpOnly/Secure/SameSite=Strict** proof Cookie. A non-secret marker `?passkey_stepup=verified` enables a `登録` button only as UX; the server ignores this marker and requires its *real* time-limited one-use proof.
4. On a separate user gesture, browser POSTs `register/options`, calls native `PublicKeyCredential.parseCreationOptionsFromJSON` and `navigator.credentials.create` (no auto-registration) and sends the browser's `credential.toJSON()` to `register/verify`. Only the Worker can persist a credential after WebAuthn signature/UV/origin/RP/challenge/step-up verification. User handles are opaque; browser never receives a private key.
5. Registration success is shown only if server confirms `registered:true`. Decline, expiry and network errors show recovery guidance; no automatic retries or session changes.

## Security/acceptance gaps (STOP before enabling)

- Verify exact LINE provider `auth_time` and `amr` on an actual account/registered callback. Current tests stub provider data. A missing or unexpected claim fails closed until reviewed.
- Cookie/session sliding/renewal during the OAuth full-page redirect can invalidate exact session binding; **keep failure closed** and add a safe retry UX rather than bypass the constraint.
- Validate actual Android Chrome + iOS Safari Home Screen browser support for `parseCreationOptionsFromJSON` / `toJSON` and authenticator conditions; no real device test has been performed.
- Add audited same-user end-to-end passkey registration / invalid credential denial / cross-User spoof / concurrent proof consumption, and operational per-IP rate limits. Local-fake CI alone is not an authorization to release.
- Before any user access: ensure `PASSKEY_REGISTRATION_ENABLED` is off by default in all deployed environments, inspect Cloudflare effective vars, review actual origin/RPID and LINE callback whitelist, approval of add-only Migration 0012, baseline & recovery point.
- Production `main` pushes trigger D1 Migration/Worker deploy. **No PR #346/#347/#348/#349/this PR may merge without explicit separate Human gate**, and no remote writes are authorized.

## Tests

`tests/passkey-http.test.ts`: capability disabled/enabled response, no User/Player/Score writes and fail-closed routes. `tests/passkey-browser.test.ts`: native WebAuthn credential JSON conversion via an injected fake authenticator, malformed options and cancellation. Existing S1 and S2-A/B local D1 & migration regression run in CI. Not equivalent to a real browser passkey round trip.

Sources: WebAuthn `PublicKeyCredential.parseCreationOptionsFromJSON` / `toJSON` and `@simplewebauthn/browser` flow from official MDN/SimpleWebAuthn docs.
