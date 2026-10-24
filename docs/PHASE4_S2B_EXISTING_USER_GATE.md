# Phase 4 S2-B｜既存LINE UserへのPasskey登録（server core / Draft）

> **2026-10-24: review-only, not usable from UI/API.**
> Scope parent: Issue #345, S2-A Draft PR #346. S2-B branch starts **from S2-A HEAD**, not main.
> Production remains S1 only; main/Cloudflare/Remote D1 must not be touched.

## 1. Why S2-B does NOT expose HTTP endpoints yet

A normal `mahjong_session` Cookie proves possession of a signed session, **not recent identity verification**. Anyone who steals a live session must not be allowed to bind an attacker's passkey to the victim User. S2-B requires **explicit recent LINE reauthentication** for the same signed-in User.

Official LINE Login supports `prompt=login` (disables automatic login) and `max_age`, which adds `auth_time` to the verified LINE ID-token response. Production implementation of these needs a safe state-bound step-up flow: require an authenticated User before starting; record expected User and one-time flow; request `prompt=login&max_age=0`; verify nonce, token, `auth_time` (<=300 seconds old), LINE subject→same User, and discard the response on user mismatch, stale auth, duplicate callback or interruption. **Do not assume that a normal LINE login callback automatically proves step-up**. Existing LINE logins, invitations, callback flows and sliding Cookies must be regression-tested. A separate review gate decides whether to extend `line_login_states` or introduce an add-only table.

Until that trusted identity proof, request Origin/CSRF and rate limit are all wired, **the HTTP registration routes and UI must not exist**. No output from this branch is available to end users.

## 2. S2-B internal server-side core (this PR)

- `@simplewebauthn/server@14.0.3` pinned (version verified in S0 independent Worker).
- `beginExistingUserPasskeyRegistration(db, context, now)`:
  - demands trusted `FreshLineIdentity`, matching validated session User ID, and `auth_time` within 5 min (no sliding session bypass)
  - checks existing User, reads that User's existing passkeys as `excludeCredentials`
  - **does not create User, Player, Membership or Invitation**; no Score writes
  - persists CSPRNG challenge hash using S2-A `issuePasskeyChallenge`, binds purpose `register_user` and server-fixed Production Origin/RPID
  - passes **raw 32 challenge bytes**, not base64url UTF-8, into SimpleWebAuthn `generateRegistrationOptions`. Uses ES256, residentKey+UV required, attestation none, stable hashed opaque user handle
- `finishExistingUserPasskeyRegistration(db, context, flowId, response, now)`:
  - repeats fresh-reauth User identity check, refuses invalid/expired/consumed flow
  - `verifyRegistrationResponse` checks WebAuthn clientData, challenge-hash callback, server-stored Origin/RPID, UV and attestation signature/public key
  - only **after** successful verification atomically claims one challenge via S2-A conditional `UPDATE ... RETURNING`
  - inserts Credential ID globally UNIQUE across revoked rows with verified public key BLOB, counter and backup flags; no private key or biometrics
  - claimed flow + failed insert means start **a new flow**, not reuse the old; User/Player/Score remain unchanged
  - does **not** issue a Session; S2-C will implement passkey login separately

## 3. Acceptance & unfulfilled gates

- [ ] final Draft PR HEAD lint/test/build/isolated local D1 tests PASS
- [ ] native physical browser-to-Worker WebAuthn registration round trip integrated with real D1 (not S0 ephemeral Map)
- [ ] D1 challenged flow across multiple Workers + concurrent credential INSERT/unique violation + revoked ID reuse tested
- [ ] LINE prompt=login / max_age=0 / verified auth_time / same User, signed step-up state, CSRF/Origin, request rate limiting and sensitive operations audit **implemented and reviewed**
- [ ] credential registration HTTP endpoints & UI after security gate, then Android/iOS manual tests
- [ ] separate explicit Human approval for merging S2-A and S2-B and for any Production/Preview Migration/Worker deploy/Secrets

## 4. STOP

Never use browser-provided User ID, Origin/RP ID, unaudited redirect or normal session expiration as proof of recently verified identity. Never create or link new Player for existing-user registration. Reject duplicate Credential ID globally. Never expose full WebAuthn registration without same-user step-up. Do not treat S2-B core as passkey login feature. See parent Issue #335, S0 #337, S1 #343 and S2 #345.

Primary docs: LINE Login https://developers.line.biz/ja/docs/line-login/integrate-line-login/ and https://developers.line.biz/ja/reference/line-login/ ; SimpleWebAuthn https://simplewebauthn.dev/docs/packages/server .
