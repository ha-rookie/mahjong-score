# S0 Cloudflare HTTPS Preview公開ゲート（未実行）

- Parent Issue: #335 / S0: #337
- Parent PR: #341（実機用Stateless Worker）
- This child branch: `poc/issue-337-preview-publish-gate`
- Status: **GitHub Actionsの公開経路を準備。公開はまだ未実行。**

## 実行可能性

2026-10-03の三麻スコア main Push Run #37107283293 でCloudflare Production deployが成功している。GitHub repository secrets名 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` は既存のdeploy-production.ymlに利用定義あり。実際のSecret値と、独立Worker Preview権限は取得・確認していない。

Cloudflare公式 Previews は、既存Workerが無くても `wrangler preview` で直接Previewを作れる。GitHub Actions上でCloudflare API token/account IDを環境変数として渡す方式を公式が提供している。

## 承認前の状態

1. PRによるGitHub Actionsは `prepare` ジョブのみ。 `wrangler preview --help` と本番設定と分離したconfig・dry-run buildを確認する。
2. 公開ジョブは専用branch `poc/issue-337-preview-publish-gate` への **承認マーカーファイル1件のみを追加するpush** でだけ起動する。
3. マーカー名 `poc/passkey/mobile/.approve-preview-publish`、内容は正確に `APPROVE_S0_PUBLIC_HTTPS_PREVIEW_ONLY`（改行可）。マーカーを置くまでは公開ジョブは一度も実行しない。
4. **このPRにはマーカーを作成しない。** 明示的なHuman公開承認、GitHub CI成功、実際のSecrets/Cloudflare permissions確認後に限り公開triggerを検討する。

## 公開ジョブの範囲

- 対象Worker名: `mahjong-score-passkey-s0-phone-337` （本番 `mahjong-score` とは異なる）
- Preview名: `s0-phone-check-337`。新規WorkerのPreviewであり、Productionへの `wrangler deploy` は行わない。
- Command: `npx wrangler preview --config poc/passkey/mobile/wrangler.jsonc --worker-name mahjong-score-passkey-s0-phone-337 --name s0-phone-check-337 --ignore-base-config --json`。
- D1/Vars/Secrets/Assets/Service bindingsなし。Cloudflare認証Secretは**GitHub Actionsランナーでのみ**使用し、Workerには注入しない。
- 成功したら `.preview.urls[0]` を検証し、GitHub Actionsログ・Job Summaryへ検証URLを記録する（推測URLは使用しない）。
- リモート健康応答 `noDatabase=true`, `noUserData=true` と `X-Robots-Tag: noindex` をHTTPSで確認。
- 無記名公開のためPreview URLは**公開アクセス可能**。noindexは認証ではない。本人情報は入力させず、テスト用パスキー以外は使用しない。Cloudflare Access等のアクセス保護が必要なら公開前に別検討。

## 後片付け / 再検証

- 実機確認後は `npx wrangler preview delete --worker-name mahjong-score-passkey-s0-phone-337 --name s0-phone-check-337 --skip-confirmation` で**このPreviewだけを削除**。削除は別の明示的操作と権限確認を要する。
- iPhone/Androidに残ったテスト用パスキーは端末OSから削除。ページのLocal record削除ボタンのみでは消えない。
- リモートPreviewの作成・削除そのものは、このREADME作成では実行していない。

## STOP

- `mahjong-score` production Worker名と一致、またはD1/Secrets/他リソースbindingが含まれる場合は中止。
- GitHub Actions Secret/Cloudflare permission不足なら中止、Successと記録しない。
- `wrangler preview` 実行結果に正しいHTTPS URLが無い・ヘルス/ヘッダ検証が不合格なら公開完了扱いにしない。CloudflareにPreviewが残存した場合は削除を記録。
- Humanの承認なしにマーカーを作成しない。既存PRのmain merge/本番デプロイとは独立。

Cloudflare公式:
https://developers.cloudflare.com/workers/previews/get-started/
https://developers.cloudflare.com/workers/previews/examples/
https://developers.cloudflare.com/workers/previews/

## 2026-10-20 発行方式の修正

- 先の検証で `mahjong-score-passkey-s0-isolated` に対する `wrangler preview --json` は成功応答（preview / deployment）を返したが公開URLが空。後から設定を変更してもURLが空のため、**本番DeployでPreview URLを有効化する操作は行わず**、別名の新規独立検証用Worker `mahjong-score-passkey-s0-phone-337` を初回Preview作成対象に変更。
- 新Workerには `workers_dev: true`, `preview_urls: true` を**初期設定**として付ける。これは専用Workerのみで、三麻スコア本番 `mahjong-score` は一切変更しない。独立WorkerにProductionスクリプトのDeployは行わない。
- 旧名前のCloudflare Worker/Previewメタデータが残っている可能性がある。旧データベースや認証情報は紐付いておらず、公開URLが返った証跡もない。Cloudflare内の旧テストリソースは別途安全確認後に整理する。
- 今回のPreview公開承認の範囲を越えて、Production経由の設定変更・既存Workerの更新・mainマージ・Remote D1操作は行わない。

## S0サーバーWebAuthn署名検証（2026-10-21）

- 独立ページ /server-check を追加（ブラウザ互換性テスト / は変更なし）。
- **別のテスト専用パスキーを新規作成**し、実WebAuthn Registration/Authentication JSONを独立Workerの @simplewebauthn/server@14.0.3 で検証。
- Workers側でサーバー生成Challenge・HTTPS Origin・RP ID・UV・Credential公開鍵・実署名を照合する。
- Registration は registrationVerified=true、Authentication は signatureVerified=true, serverVerified=true, sessionIssued=false を目標にする。
- 本番ユーザーID・LINE・Player・成績・Cookie session・D1/KV/Secrets/DO Bindingなし。
- PoC用サーバー状態は**Worker isolateのMapのみ**（最大24フロー、TTL 10分、Challenge2分・使用時消費）。環境切替で失われ、その場合は ephemeral_state_missing として失敗する。Cloudflare推奨の本番状態管理ではない。
- 状態消失が続くときは何度もパスキーを作らない。永続D1/DO設計へ移るには別のスコープ・権限判断が必要。
- ローカルworkerd＋Chromium CDP仮想認証器でサーバー登録とログイン署名の検証・Challenge再利用拒否等 **20/20 PASS** (Run #39488620635)。実Android/Remote Edge成功は別途未確認。
- 本テスト終了後、端末パスキー管理から新旧のテストCredentialを削除する。ページの記録削除はOS内のパスキーを削除しない。
- 公開はHuman承認済み独立S0 Workerの範囲のみ。main、Production、実D1、Secrets、実ユーザーデータは不変更。
