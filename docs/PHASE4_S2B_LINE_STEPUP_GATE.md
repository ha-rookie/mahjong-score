# Phase 4 S2-B｜LINE再本人確認・使い捨て証明の内部実装（Issue #345）

> Status 2026-10-24: **Draft / server-only security foundation / NOT HTTP connected**.
> Stacked on S2-B Draft PR #347 (`240a6cfcef398301cd1d5b6f4eb8372078c901d4`).
> Production remains S1. **No main merge / Remote D1 migrations / Worker deploy / Secrets changes**.

## Why a separate table

The current LINE OAuth `line_login_states` has a normal login flow that **may create a new User and attach Player**. A high-risk *existing User passkey addition* must never take this route by mistake. A dedicated `passkey_line_stepups` table is therefore added in **0012** without mutating past migrations/identities/Player/Score.

State stores **only SHA-256 of opaque OAuth state and signed-session Cookie**, random nonce and pre-verified existing User ID; never an access token, ID token, nonce-less callback or plain session value. The `state` begins with `s2b_` so the future LINE callback can be dispatched to **separate logic** without changing normal login semantics.

## Server-only design

- `beginPasskeyLineStepUp(env,userId,signedSessionCookie)`: `userId` must come from valid authVersion-checked existing signed session, and the user must already own a LINE identity; rate-limit <=6 starts per rolling hour *as defense-in-depth* (non-atomic estimate, require perimeter throttling separately); 10-minute state; `prompt=login`, `max_age=0`, `openid profile`, cryptographically random state/nonce, and **existing registered LINE redirect URL** `/api/auth/line/callback`. No new LINE callback registration.
- `finishPasskeyLineStepUp(...)`: **atomically claims state first** using `UPDATE ... RETURNING` bound to signed original session Cookie hash and existing User. It exchanges the OAuth code with LINE, then calls LINE's official ID-token verification endpoint using stored nonce; rejects wrong issuer, channel audience, nonce, expiry, clock anomalies, old `auth_time`, `amr` containing automatic login, and LINE subject not mapped to the existing **same User**. The old LINE path that creates users/links Player must never run.
- After valid response, store only SHA-256 of a new 32-byte **proof token**; the future callback will place raw proof in an HttpOnly/Secure/SameSite cookie (NEVER a URL or log).
- `readPasskeyStepUpProof`: requires **the same signed Cookie, same User, hash-matched proof, unused proof, `auth_time` within 300 seconds**, returns only trusted `FreshLineIdentity` fields for S2-B registration helper.
- `consumePasskeyStepUpProof`: one-shot conditional `UPDATE ... RETURNING`. The later registration verification route must consume this proof **before any credential INSERT**, and use S2-A's one-time WebAuthn challenge. Failure requires repeating reauthentication; no partial User/Player/Score modifications.

## Security / explicit stop conditions

**There are currently no HTTP routes or UI that call these helpers.** Consequently, new migration 0012 **has NOT been applied to remote D1**. Before turning on:
1. Add explicit feature flag **off by default**; require exact configured HTTPS Origin, Content-Type, CSRF protection, max request sizes and rate limits; every route must first verify authVersion session and explicit same-origin requests, and fail closed on 503.
2. Bind raw Cookie extraction to the **already verified** signed session, guard double callback, and do not silently route regular LINE sign-in into step-up. Implement callback same-browser proof with HttpOnly cookie and fixed redirect; preserve existing invitations and LINE sign-in.
3. Integrate `register/options` and `register/verify` (S2-B #347) requiring step-up proof from *same session*; consume proof prior to any irreversible credential insertion. Real WebAuthn signature + RP/origin/UV and DB uniqueness checks remain mandatory. Do not expose these APIs until verified.
4. Add actual local Worker API contract tests and real Android/iOS registration tests. Check behavior if the auth session slides/reissues mid-flow: **fail closed** and let the user repeat safely, rather than weaken session binding.
5. Confirm official LINE `auth_time` and `amr` behavior with a real account before enabling; official LINE docs state `auth_time` exists only when `max_age` is requested and `prompt=login` disables automatic login. Rejection of absent `amr` is intentionally conservative; real integration might require review.

## Tests

- `tests/passkey-line-stepup.test.ts`: D1 fake covers prompt/max_age, User with LINE, unlinked user, per-user rate cap, hashed state/cookie, same-browser proof, one-time claim, wrong account, wrong nonce/aud, aged auth, automatic login, expired state and D1 errors. Provider fetch is stubbed; **not real LINE authentication**.
- `tests/passkey-line-stepup-d1.test.ts`: Wrangler **LOCAL isolated** D1 migration 0012, SQL conditional updates and replay attempts, foreign-key and uniqueness constraints.
- Existing migration guards, original User/Player/Score preservation, S1 and S2-A/B regressions run on the final Draft PR CI.
- **No Remote D1 read/write** is authorized here.

References: [S2 Issue #345](https://github.com/ha-rookie/mahjong-score/issues/345), [S2-A PR #346](https://github.com/ha-rookie/mahjong-score/pull/346), [S2-B core PR #347](https://github.com/ha-rookie/mahjong-score/pull/347).
Official LINE: https://developers.line.biz/ja/docs/line-login/integrate-line-login/ and https://developers.line.biz/ja/reference/line-login/.
