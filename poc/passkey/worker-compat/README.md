# S0: SimpleWebAuthn × Cloudflare Workers local runtime

- Issue: #337 / Parent: #335 / Current design: PR #336
- Status: **GitHub Actions local workerd検証成功（実機/remote未検証）**。Run #39404066013 (2026-10-20) / HEAD 343c9e024450e2ee2a85443fc6a9c40be26894be.
- Purpose: S0 PR #338（Nodeの合成WebCryptoテスト）とは**独立**し、実際の `@simplewebauthn/server` をCloudflare `workerd`互換の`wrangler dev --local`で検証する。
- No deployment, no Cloudflare API token, no Production/Preview D1, no new migration, no application code changes. **既存Migration 0001〜0010を偽IDの隔離ローカルD1にだけ適用**する。

## Configuration / dependency

- Project wrangler.jsonc compatibility_date `2026-09-23` を**隔離環境の設定でも維持**。2026-08-04以降Node.js compatはWorkersで既定有効。ただし互換性の最終確認は実行結果による。
- `@simplewebauthn/server@14.0.3` をGitHub Actionsの一時ワークスペースへ `npm install --no-save --no-package-lock`。rootのpackage.json/lockはコミットしない。
- `wrangler deploy --dry-run` は**バンドル確認専用**。Cloudflareへのアップロード／デプロイをしない。
- `wrangler dev --local` はloopback `127.0.0.1:8799` のローカルworkerd。Remote Worker/Productionとは独立。

## Cases

`worker.mjs`が毎回ランダムP-256鍵／Credential IDを生成し、実WebAuthnライブラリで次を検証する。

1. `generateRegistrationOptions()` のChallenge/RP/Passkey設定。
2. `verifyRegistrationResponse()` に合成 `fmt:none` attestation + P-256 COSE公開鍵を渡して正常署名不要の登録検証。
3. `generateAuthenticationOptions()` でdiscoverable credential(`allowCredentials: []`)を要求。
4. `verifyAuthenticationResponse()` に合成AuthenticatorData + 有効ECDSA署名を渡す。
5. Wrong Origin/Wrong Challengeを検証ライブラリが拒否する。

検査対象のテストだけを分離している。実User/Player/Invitation、秘密鍵の永続保存、iOS/Androidブラウザ、Remote D1は使用しない。秘密鍵はテスト実行中にメモリに置くのみ。

## Local D1 probe (added after the initial successful WebAuthn run)

An **isolated, fabricated D1 binding** named `passkey-s0-local-fixture` with test-only ID `00000000-0000-4000-8000-000000000337` is used exclusively by `wrangler dev --local --persist-to /tmp/passkey-s0-isolated-d1`. It does not refer to any existing Cloudflare database and cannot access Production data. The probe creates its own `s0_*` tables in the test DB; no repository migrations are changed.

Separate `GET /db-probe` fixture tests ten conditions: happy invite claim; duplicate claim rejection + rollback; concurrent double-claim one winner + no orphan User; revoked invite rejection + rollback; credential uniqueness failure + rollback; and demonstration that an UPDATE affecting zero rows does not abort a D1 batch. A local SQLite trigger prevents an invalid claim from silently continuing to the next batch statement.

These are **simplified test tables**, not the existing `invitations`/`group_players` schema. A passed test demonstrates D1 transactional mechanics in workerd and a possible fail-closed pattern; it does not prove production migration or real invite integration. Current execution result must be obtained from GitHub Actions after this change; old WebAuthn-only run is not D1 evidence.

## Acceptance

- [x] GitHub Actionsの`S0 isolated WebAuthn workerd compatibility`がPR HEADでSUCCESS（Run #39404066013）。
- [x] npmパッケージ14.0.3の一時取得と`wrangler deploy --dry-run`が成功（708.01 KiB / gzip 129.71 KiB）。
- [x] ローカルworkerdから登録・認証・Wrong Origin/Challenge拒否の5項目が実行成功。
- [ ] 以上は**ローカルworkerdでの検証**でありCloudflareデプロイや実機パスキーのPASSではないとIssue #337へ正しく記録。
- [x] Isolated local D1 fixtureの10項目（happy/replay rollback/concurrent 1 winner/revoked/duplicate Credential/changes=0 consequence）成功。**簡易 `s0_*` テーブルに限定。既存招待処理のテストではない。**
- [x] 既存Migration 0001〜0010の適用と、現行LINE招待SQLを複製した16項目のローカルD1検証（Run #39406097518）。**本番ハンドラーは実行していない**。
- [ ] S0完了に残るProduction/Preview origin・RP IDの現状実測、iOS/Android実機、**実アプリハンドラーとの結合**、実Cloudflare Edge検証は別Gateとして保持。

## Scope

**このPRだけの変更**: `.github/workflows/s0-passkey-worker-compat.yml`、`poc/passkey/worker-compat/{worker.mjs,wrangler.jsonc,README.md}` の4ファイル限定（D1テストは既存の`worker.mjs`/`wrangler.jsonc`/workflow内に追加）。元PR #338（2ファイル限定）には触れない。

## Official references

- https://simplewebauthn.dev/docs/packages/server
- https://simplewebauthn.dev/docs/advanced/passkeys/
- https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- https://developers.cloudflare.com/changelog/post/2026-08-04-nodejs-compat-default/
- https://developers.cloudflare.com/d1/worker-api/d1-database/

## Run #39404066013 の確定証跡

- local Worker SimpleWebAuthn: 5/5 PASS
- local isolated D1 fixture: 10/10 PASS
- bundled Worker: 708.01 KiB（gzip: 129.71 KiB）
- テストランナー: GitHub-hosted Ubuntu / Node 24 / Wrangler 4.135.0 / SimpleWebAuthn Server 14.0.3
- Production, Remote D1, Secrets, 実ブラウザパスキーは一切使用せず
- 実際のCloudflare Edgeおよび実アプリハンドラーは**未検証**。元のinvitations/group_playersテーブルは隔離ローカルD1で検証済み。
- Evidence URL: https://github.com/ha-rookie/mahjong-score/actions/runs/39404066013

## Run #39406097518 の既存スキーマ照合（2026-10-20）

- 現行mainの `migrations/0001_initial.sql`〜`0010_game_result_placement.sql` を**改変せず**、test-only D1 binding `00000000-0000-4000-8000-000000000337` に `wrangler d1 migrations apply DB --local --persist-to /tmp/passkey-s0-isolated-d1` で適用（10本すべて✅）。
- 現行 `src/worker/auth/line-login.ts` の `redeemInvitationById` のSQL処理をS0 Workerd内にテスト用に再現。**既存Workerコードを直接import/実行していない**。
- 正常な招待受諾、同一Token再使用、失効、Playerの他Userとの紐付け済み、同一Userが同Group別Playerに既紐付け、2 Userによる同時受諾、既存UserとPlayerの独立性を16ケース検査→**16/16 PASS**。
- SimpleWebAuthnの登録/署名認証5/5および簡易D1トランザクション10/10も同一RunでPASS。
- 注意: 実際の新規Passkey Credentialを既存DBへ格納するSchema/Migrationは**作っていない**。LINE認証callbackのstate、WebAuthn Challengeのデータ永続化、Application Handler自体の試験も未実施。
- GitHub Actions証跡: https://github.com/ha-rookie/mahjong-score/actions/runs/39406097518
- **実機・Preview/Production RP ID/実Cloudflare Edge・S1実装ゲートは未完了。**
