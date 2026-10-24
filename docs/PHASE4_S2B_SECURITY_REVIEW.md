# S2-B セキュリティレビュー／隔離実機検証の事前Gate

**2026-10-24 | Issue #345 | Draft PR stacked on #350 | Production unchanged**

## Review findings addressed in this Draft

| ID | Finding | Fix | Evidence |
| --- | --- | --- | --- |
| S2B-SEC-01 | `/?passkey_stepup=verified` is an unsigned display hint. An attacker can append it and make the UI claim LINE reauthentication was completed, even though the Worker rejects registration without the real proof. | Add read-only, same-session `GET /api/auth/passkey/stepup/status`; require the real unconsumed hashed HttpOnly proof and current verified User. UI checks capability and proof status and only then enables “register”. A marker alone can never show verified. | `passkey-http.test.ts`, mock D1, no Score changes |
| S2B-SEC-02 | LINE `amr` may be absent, per provider docs; existing code intentionally denied absence but accepted an unknown non-auto value. | Fail closed on missing, empty, `lineautologin` or undocumented method. Accept `pwd`, `lineqr`, `linesso`, `mfa` only with intact nonce, aud, iss, exp, recent auth_time and same linked User. **Do not relax missing-amr behavior without a verified real account test and security approval.** | `passkey-line-stepup.test.ts` |
| S2B-SEC-03 | A PR/config drift might accidentally bind local Preview to the Production D1 or enable the feature. | Static regression gate checks Production/Preview D1 IDs differ, Preview binding is configured, no enrollment flag exists in Wrangler. | `passkey-preview-readiness.test.ts` |

## Release blockers that remain unresolved — do not enable yet

1. **Real LINE OAuth evidence**: prove `prompt=login`, `max_age=0`, nonce, `auth_time`, and actual `amr` on an active account with a LINE-registered callback. LINE's official docs explicitly say `amr` may be omitted. Never write the raw ID token, nonce, code, linked LINE subject or Cookie into public logs. If `amr` is omitted, security review must define a documented, testable fallback **before** implementing it.
2. **Isolated Preview with correct WebAuthn RP**: S2-B currently pins `https://mahjong-score.ha-rookie.workers.dev` + `mahjong-score.ha-rookie.workers.dev`. A new Preview Worker host is **not** the same RP; direct registration there cannot pass the existing server Origin/RP checks. Must first introduce **reviewed server-side configured allowlisted Origin/RP ID**, verify HTTPS and a registered LINE callback for that test origin and isolate D1 with disposable User/Player/Score. No copying Production LINE secrets or historic data to an externally accessible test host.
3. **Automatic Production deploy on main**: `.github/workflows/deploy-production.yml` automatically runs Recovery Point, remote D1 migration and Worker deploy on a main push. Thus, #346→#347→#348→#349→#350→this PR cannot be merged for an experiment without a new specific Human production approval. **All PRs stay Draft**.
4. **Operational protections**: real per-IP and per-User rate-limit under concurrent requests, request size and CSRF/Origin tests, failure/recovery with renewed signed Cookie after LINE redirect, idempotency/unique-credential concurrency and stale proof. Existing `STEPUP_MAX_HOURLY_STARTS` uses SELECT+INSERT and is not an atomic rate limit.
5. **Real browser acceptance**: Android Chrome + iPhone Safari, normal and PWA/standalone, user gesture, native WebAuthn creation, verified Credential persisted to isolated D1, 1-credential 1-User, challenge/proof reused rejected, existing LINE and group/score preserved. Current CI tests fake auth devices and local D1 only. Do not report real phones tested.
6. **Passkey login still absent**: this development only adds an existing-user credential. S2-C login and S2-D invitation onboarding remain distinct; do not claim S2 completed.

## Controlled next step (NO remote operations authorized now)

- Review existing Preview Worker/LINE test-channel callback registrations and D1 bindings **read-only** if connectors support it. No remote inspection token currently dedicated to this task; do not invent a valid callback URL or Secrets.
- Implement staging Origin/RP ID configuration guarded by an explicit enum/allowlist, with server default Production **only if the staging plan passes review**; tests must reject arbitrary Host/request.origin values and mismatched database IDs.
- Prepare an isolated test workflow triggered only on explicit approval; no main push and no implicit Production migration. Production data must not be copied into the test D1. If a test LINE channel cannot be configured, leave real-LINE stage blocked and continue local negative-case security tests.
- Record final evidence in S2 Issue #345, Notion and the specific Draft PR. When proposing remote deployment, present exact target Worker, D1 database ID, LINE redirect host, data affected, rollback and stop conditions **before** requesting a scoped human approval.

Primary sources: https://developers.line.biz/ja/reference/line-login/ ; https://developers.line.biz/ja/docs/line-login/integrate-line-login/ ; https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential/parseCreationOptionsFromJSON_static ; https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential/toJSON .
