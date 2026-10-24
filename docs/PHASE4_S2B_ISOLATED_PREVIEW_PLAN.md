# Phase 4 S2-B｜隔離Preview向けRP ID・LINE認証の構成設計（実デプロイ未実施）

> 2026-10-24 / Issue #345 / stacked Draft after PR #351
> **Status: server config and LOCAL CI only. NO remote Worker, D1, LINE settings or secrets have been modified.**

## Fixed environment contract

`src/worker/auth/passkey-rp-config.ts` accepts only server-owned configuration, **never** `Request.url`, `Host`, Origin header, or a WebAuthn client field as a trusted expected RP.

| Variable | Production | Isolated Preview |
| --- | --- | --- |
| `PASSKEY_AUTH_ENVIRONMENT` | `production` (required to enable feature) | `isolated-preview` |
| `PASSKEY_REGISTRATION_ENABLED` | **unset/false until approved** | **unset/false until actual isolated proof succeeds** |
| `PASSKEY_PREVIEW_ORIGIN` | unset | Explicit exact HTTPS hostname under `*.ha-rookie.workers.dev`, distinct from Production; must be a **real, approved** Worker host |
| `LINE_CHANNEL_ID` | Existing Production channel | **separate** approved LINE Login channel ID (must NOT equal `2011726648`) |
| `LINE_CHANNEL_SECRET` | Production secret | A separate Preview-only channel secret, never copied from Production |
| `AUTH_SESSION_SECRET` | Production session signing secret | New independent Preview-only signing secret |
| `DB` binding | Production `mahjong-score-prod` | **isolated** Preview D1 with its own UUID; never reference Production D1 ID |

The RP ID is **always derived from the explicitly configured server Preview origin hostname**, not from browser inputs. The LINE step-up callback is that same origin plus `/api/auth/line/callback`; the actual callback must be pre-registered in the test LINE Login channel. The normal LINE login uses the request origin for its callback, so the isolated Worker and test LINE channel must consistently use **one** domain.

**Important release fail-safe:** Feature flag alone is insufficient. To enable S2-B endpoints the server requires `PASSKEY_REGISTRATION_ENABLED===true` **and** explicit `PASSKEY_AUTH_ENVIRONMENT`. Isolated Preview rejects the Production host and LINE channel; invalid origin/Host/port/path/credentials/query is fail-closed. Production has no configuration change in this Draft, and production deploy remains disabled by Human Gate.

## Preflight gate — required before creating a real test Worker

1. Document a **verified** full Preview Worker URL, separate Worker name, Cloudflare account, and new isolated D1 UUID. Do not invent resource identifiers or derive an ID from Worker name. Include a plan to verify the deployed Worker binding actually points to that D1 before any login.
2. Confirm LINE Developers test channel exists, with registered exact callback `https://<verified-preview-worker-host>/api/auth/line/callback`; use new test-only channel secret and separate signing secret. Neither credential belongs in GitHub commit, Issue text, CI log, Notion or response.
3. Create a **separate** `wrangler` manifest with explicit isolated Worker name, D1 UUID, `vars` for Preview channel and server-only origin/mode. Do not reuse `wrangler.jsonc` with its Production D1 binding. Review artifact diff and execute existing binding guard adapted to the separate target; the current generic Production guard intentionally does not prove Preview deployment safety.
4. Populate only disposable test User/LINE identity/Group/Player/Score; do not transfer real Production user rows or LINE subjects to Preview. Do not test against Production D1.
5. Before enablement, complete real LINE `prompt=login`/verified `auth_time`/`amr` and Android Chrome/iPhone Safari WebAuthn registration through this exact host; test lost Session/expired proof/double callback/replay/cancellation/credential collision. Current code fails closed on missing LINE `amr`, which the provider may omit.
6. Review possible operational pitfalls: cookies are host-only; if the auth Cookie is reissued or the browser changes its session during OAuth, the signed Cookie hash changes and the step-up fails intentionally. Need recovery UX, not weakened bindings. Per-IP rate limit is not implemented yet; current starts-per-hour via DB count is not atomic.
7. Obtain **separate explicit Human approval** covering Worker name/host, D1 UUID, LINE channel/callback, isolated secrets/vars, `0012` migration, feature flag, rollback and testing window. Do not merge stacked #346–#351 or this PR without it; `main` push triggers automatic **Production** migration+Worker deploy.

## Tested without credentials

- Resolver returns identical Production Origin/RP for existing unit helpers without enabling UI, and refuses a lone feature flag.
- Isolated Preview requires a different exact allowlisted HTTPS host + separate LINE channel, generates the correct WebAuthn RP ID and matches LINE start/token callback.
- Missing/invalid mode, Production host, Production channel ID, non-HTTPS, path/query, arbitrary domain, port, origin spoof, unset flag all fail closed.
- No remote Cloudflare or LINE Developer config inspection is claimed; these values are **not verified remotely**.

See [Issue #345](https://github.com/ha-rookie/mahjong-score/issues/345), parent [PR #351](https://github.com/ha-rookie/mahjong-score/pull/351), and [security review](https://github.com/ha-rookie/mahjong-score/blob/8388e0c1269e232f24e3d19cf0f9ea671220ecdd/docs/PHASE4_S2B_SECURITY_REVIEW.md).
