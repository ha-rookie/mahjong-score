# S0: SimpleWebAuthn × Cloudflare Workers local runtime

- Issue: #337 / Parent: #335 / Current design: PR #336
- Status: **proposed test / 未検証**（GitHub Actionsで実行して判定する。Workflow起票だけではPASSとしない）
- Purpose: S0 PR #338（Nodeの合成WebCryptoテスト）とは**独立**し、実際の `@simplewebauthn/server` をCloudflare `workerd`互換の`wrangler dev --local`で検証する。
- No deployment, no Cloudflare API token, no Production D1, no migration, no app code changes.

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

## Acceptance

- [ ] GitHub Actionsの`S0 isolated WebAuthn workerd compatibility`がPR HEADでSUCCESS。
- [ ] npmパッケージ14.0.3の一時取得と`wrangler deploy --dry-run`が成功。
- [ ] ローカルworkerdから登録・認証・Wrong Origin/Challenge拒否が実行成功。
- [ ] 以上は**ローカルworkerdでの検証**でありCloudflareデプロイや実機パスキーのPASSではないとIssue #337へ正しく記録。
- [ ] S0完了に残るProduction RP ID/Preview hostname実測・iOS/Android実機・D1並列性は別Gateへ維持。

## Scope

**このPRだけの変更**: `.github/workflows/s0-passkey-worker-compat.yml`、`poc/passkey/worker-compat/{worker.mjs,wrangler.jsonc,README.md}` の4ファイル限定。元PR #338（2ファイル限定）には触れない。

## Official references

- https://simplewebauthn.dev/docs/packages/server
- https://simplewebauthn.dev/docs/advanced/passkeys/
- https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- https://developers.cloudflare.com/changelog/post/2026-08-04-nodejs-compat-default/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
