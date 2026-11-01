# Phase 4 S2-A｜D1-backed WebAuthn Challenge Foundation（Issue #345）

> Status: **Draft implementation, NOT wired to production authentication.**
> Baseline: main `21b890c1ebd70fcc6069b64c84d3bf4c063603b3`, S1 Production Migration 0011 applied 2026-10-23.
> Scope: shared Worker-internal challenge generation, persisted hash, server-fixed scope, one-time consumption, unit/local D1 tests.
> **No login endpoint, UI, Credential creation, Cookie issuance, database migration, or remote D1 change.**

## 1. Purpose and separation

Previously independent S0 PoC proved Android/WebAuthn authentication with an ephemeral Worker Map; **never reuse the ephemeral Map in Production**. S1 added `auth_challenges`/ `passkey_credentials` and versioned LINE Cookie. S2-A adds an internal, stateless Worker helper that persists challenges in the existing `auth_challenges` D1 schema. It does not by itself implement passkey registration or login. S2 Issue #345 governs the implementation roadmap; parent #335 governs Phase 4 acceptance.

## 2. Contract

`src/worker/auth/passkey-challenge.ts` exports:

- `issuePasskeyChallenge(db, scope, now?)`: 32 bytes CSPRNG, 43-character base64url challenge, SHA-256 digest only in DB, UUID flow ID; expiry in **120 seconds**, exact purpose + User or invitation + **server-owned HTTPS Origin/RP ID**. Returns challenge only to future WebAuthn options caller; no sensitive logging.
- `readPasskeyChallenge(db, id, scope, now?)`: query **active and unconsumed** flow, selecting stored digest + fixed Origin/RP ID. Future verifier supplies an `expectedChallenge` callback comparing hash of clientDataJSON.challenge with the saved digest; it must cryptographically verify complete WebAuthn response before consuming.
- `consumePasskeyChallenge(db, id, scope, verifiedChallenge, now?)`: **single conditional `UPDATE ... RETURNING`** restricted by id/digest/purpose/target/exact origin+RP, expiration and unused state. Exactly one successful claim is the replay gate; no independent `batch meta.changes` guard.
- Scope: `register_user` requires existing User ID (obtained from server-authenticated session); `register_invite` requires an invitation ID (resolved on server from a verified token); `login` requires neither User nor invitation, to support discoverable `allowCredentials: []`. Do not trust browser-supplied `userId`.
- Origin/RP exact-host HTTPS is the **initial conservative policy**. Production origin `https://mahjong-score.ha-rookie.workers.dev` must be pinned via a future reviewed server config, not derived from `request.url`, `Host`, or `clientDataJSON.origin`. Environments/alternative domains require a separate approved allowlist.

## 3. Integration requirements (not yet complete)

1. After S2-A green CI, S2-B: fixed-origin server config; audited dependency version `@simplewebauthn/server` (S0 validated 14.0.3, app dependency not yet added); existing logged-in User registration, re-authentication freshness, Origin/CSRF, Credential globally UNIQUE and User-bound. No additional User/Player creation.
2. S2-C: for a logged-out User, discoverable passkey response Credential ID is resolved by a server-side UNIQUE lookup, checking `revoked_at`, WebAuthn signature+UV+RP+Origin+counter and `authVersion` Cookie. Client-provided User ID/username are not trusted. LINE login stays operational.
3. S2-D: one-time invitation registration User+Credential+Player/Membership atomic commit, proven D1 rollback on zero-row conditional update. Never add User / Player / Score changes to the S2-A helper.
4. S2-E: Android physical device and iOS Safari/Home screen Web App signoff, separate production-origin compatibility and existing data preservation. S3 handles method management/revocation.

## 4. Tests & stop criteria

- `tests/passkey-challenge.test.ts`: 7 unit checks with a fake D1 covering hashes rather than raw value, scope, duplicate/parallel claim, expiry, misbinding, malformed config, D1 down.
- `tests/passkey-challenge-d1.test.ts`: isolated **`--local`** Wrangler real D1 migration + `UPDATE ... RETURNING` wrong digest/replay/expiration checks (no remote calls).
- CI requires lint, test, build, migration guard and existing-data regression **on the final Draft PR HEAD**. Passing a fake D1 unit test does not prove production concurrency; actual D1 same-statement atomicity check is an important local gate, but production integration is still future.
- STOP on web API accidental exposure, client-supplied Origin/RP, replay allowed, invalid challenge accepted, returning successful auth without full signature verification, D1 errors bypassed, or existing LINE/User/Player/Score changes.

## 5. Approval boundaries

**This Draft PR does not authorize main merge or deploying to any Cloudflare environment.** No D1 Production or Preview writes, migration apply, Worker deployment, Cloudflare vars/secrets modifications. New S2-B integration PR must be reviewed separately; if changes to remote environments are needed, obtain explicit Human approval. S1 remains Production RELEASED and unmodified.

References: [Phase 4 parent #335](https://github.com/ha-rookie/mahjong-score/issues/335), [S2 #345](https://github.com/ha-rookie/mahjong-score/issues/345), [S1 #343](https://github.com/ha-rookie/mahjong-score/issues/343), [S0 #337](https://github.com/ha-rookie/mahjong-score/issues/337), [design review PR #336](https://github.com/ha-rookie/mahjong-score/pull/336) (legacy base; not approved).
