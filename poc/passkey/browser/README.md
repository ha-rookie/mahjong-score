# Phase 4 / S0 — Chromium browser WebAuthn proof (virtual authenticator)

Status: **isolated Chromium browser validation PASS (virtual authenticator only)**. Parent Issue #337, Phase 4 #335. Branch is based on **unmerged PR #339**; this is a separate child PR to preserve #339's four-file Scope Lock.

## What this tests

GitHub Actions starts an **isolated local Cloudflare workerd** at http://localhost:8799, with a fabricated test-only D1 ID 00000000-0000-4000-8000-000000000340.

Headless Chromium uses native WebAuthn browser APIs (navigator.credentials.create and navigator.credentials.get). Chrome DevTools Protocol installs a virtual CTAP2 authenticator with resident keys and user verification. The server verifies actual browser responses using @simplewebauthn/server@14.0.3.

- Create a synthetic invite in local D1
- Register a virtual authenticator's credential via real browser API and real server validation
- Atomically create a local User and Credential and consume the synthetic invite
- Discover and use the credential for browser sign-in; resolve same User ID
- Reject consumed invitation, replayed registration/authentication challenges, mismatched challenge, unknown Credential, and missing user verification

**Limits:** Chrome DevTools authenticator is simulated, not a physical iPhone/Android passkey. Passing these checks does not establish Safari/Android support or remote Cloudflare Edge behavior. The prototype does NOT issue an actual application session and does NOT use the real application's Player/Group/Invitation schema.

## Scope / changed files

- poc/passkey/browser/worker.mjs — isolated Worker, synthetic invite and test-only Credential/User data
- poc/passkey/browser/wrangler.jsonc — fake ID D1; workers_dev=false and preview_urls=false
- poc/passkey/browser/ci-test.mjs — Playwright/Chromium with CDP virtual authenticator
- .github/workflows/s0-passkey-browser.yml — PR-only isolated browser tests
- poc/passkey/browser/README.md — this record

**No changes** to app Worker/src, existing migrations, package.json/lock, production wrangler, Secrets, actual remote D1, Cloudflare configuration, or main. Never deploy these S0 files.

## CI command contract

Install ephemeral pinned dependencies without committing root package updates: @simplewebauthn/server@14.0.3 and playwright@1.56.1.
Install Chromium in GitHub Actions.
Run Wrangler deploy --dry-run (no upload), then Wrangler dev --local (loopback only) using a fake D1 binding.
Run node poc/passkey/browser/ci-test.mjs. Record actual results, not assumed success.

## Acceptance

- [x] GitHub Actions Run #39411353706 SUCCESS; PR HEAD 8fa68ee3a8a81ba6b2501f1d87cc49db91f8d3aa
- [x] Browser-native create() response verified by SimpleWebAuthn v14.0.3
- [x] Browser-native get() discoverable credential login resolves same test User
- [x] Synthetic invite and challenge replay, unknown credential, mismatched challenge rejected
- [x] Virtual authenticator UV required; no real User/Production credential/Cloudflare tokens touched
- [x] Only the 5 isolated files changed relative to PR #339
- [ ] Leave S0 open until mobile real-device, Production/Preview origin/RP ID, remote Edge, real User/Player invitation integration, and session revoke are validated

## Governance

Only simulation. No merge, remote Cloudflare deployment, database migration, Secrets, production login feature, or use of real member records authorized by this test. Production design is tracked by Issue #335 and design PR #336. Existing actual invitation handler integration was independently verified in PR #339, but this standalone browser proof does not call it.

References:
https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/
https://simplewebauthn.dev/docs/packages/server
https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session

## GitHub Actions実行証跡（2026-10-20）

- Run #39411353706: GitHub-hosted Chromium+CDP virtual FIDO2 authenticator / local Workerd / fake D1 / SimpleWebAuthn v14.0.3 = **SUCCESS**。
- GitHub Actionsログに、招待生成、Chromium secure context、ネイティブCredential登録・保存、仮想認証器のCredential作成、招待/Challenge再利用拒否、discoverable Credentialでのログイン・同一User識別、不正Challenge/未知Credential拒否、UV必要条件の **11項目すべてPASS** と記録。
- Worker bundle: 707.66 KiB (gzip 129.56 KiB)。操作は dry-runとlocalhostのみ。
- 実行ログURL: https://github.com/ha-rookie/mahjong-score/actions/runs/39411353706
- 実行HEAD 8fa68ee3a8a81ba6b2501f1d87cc49db91f8d3aa。以後README追記コミットについても再実行結果で最終状態を照合。
- **厳密な適用範囲:** ブラウザAPIは実物／認証器は仮想。実端末、Production/Preview HTTPS RP ID、Cloudflare Remote Edge、三麻スコア本番User/Player、通常のセッション管理は一切未検証。Issue #337は引き続きOpen。
