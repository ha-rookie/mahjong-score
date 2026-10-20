# S0｜実機用HTTPSパスキー互換性ページ（公開前）

Issue #337／親 #335。PR #340の子PRで、**実iPhone/Androidの受入準備**をする。今回のPRからRemote HTTPS Previewは公開しない。

## 設計・プライバシー

- Cloudflareアプリ本体とは別名のWorker: mahjong-score-passkey-s0-isolated。
- 静的HTML/JSのみ。D1、KV、Secrets、アプリのUser/Player/成績、LINE Login、セッションは使わない。ブラウザからネットワークAPIを呼ばない。
- originのhostnameをRP IDとして、端末内でWebAuthnのcreate/getを確認する。ローカルのclientData challenge/originおよびget応答のRP hash・UP/UV・署名存在を検査する。
- Credential ID（公開識別子）だけをブラウザlocalStorageに置く。秘密鍵はサーバーに送らない。サーバー署名検証・ユーザー認可は**対象外**。
- スマホにこのテスト専用パスキーが作成されることがある。ページの「端末内のテスト記録を削除」ではOS側パスキーは消えない。テスト後にOSパスキー管理から削除する。

## 実機確認手順（HTTPS Preview URLが用意できた後）

1. 指定された**安全なHTTPS URL**をiPhone Safari / Android Chrome / ホーム画面Web Appで開く。
2. 環境表示でsecureContext=true、WebAuthn API create/get対応、意図したRP ID＝実際のhostnameを確認。
3. 「1. パスキーを作成」でOSの本人確認を通し、PASS (create) を確認。
4. 「2. パスキーを使用」で先ほどのパスキーを使用し、PASS (get)、credentialMatched=true、userVerification=trueを確認。
5. **端末種別、OSメジャーバージョン、ブラウザ、成功/失敗、HTTPS hostのみ**Issue #337へ記録。Credential ID・氏名・位置情報等を記録しない。
6. テスト後、端末OS側の該当テスト用パスキーを削除し、localStorage側のテスト記録も削除。

これは「実機ブラウザでのパスキー作成と使用」の確認であり、「三麻スコアの実ログイン成功」の証明ではない。

## Cloudflare Remote Preview STOP

- このPRにはRemote deploy、Preview create、Cloudflare認証トークン投入を**一切含まない**。
- configはProduction Workerと別名で、D1/Secrets/Routes/Assetsを紐付けない。既存Preview DB（アプリのテストDB）も利用しない。
- Cloudflare Workers Previewsは支店・PR単位で分離できる。Version URLsはProductionリソースを利用しうるので今回は使用しない。
- 後続のRemote Preview発行にはCloudflare accountへの接続・適切な操作権限と、個別のHuman公開承認が必要。使用期間・アクセス保護・削除手順を事前確認。
- noindexはアクセス制限ではない。外部公開する際は必要に応じCloudflare Accessで保護する。
- URLを実在確認できるまで公開URLを推測して提示しない。

## 検証とScope Lock

CIではWrangler dry-runのみ。ローカルworkerd＋Chromium/CDP仮想Authenticatorで登録・使用・RP ID/UV確認・noindex/CSP/no mutable APIを自動確認する。実物理端末・Remote Edgeではない。

親PR #340との差分は次の6ファイル限定。

- poc/passkey/mobile/worker.mjs
- poc/passkey/mobile/client.mjs
- poc/passkey/mobile/wrangler.jsonc
- poc/passkey/mobile/ci-test.mjs
- poc/passkey/mobile/README.md
- .github/workflows/s0-passkey-mobile-readiness.yml

main、実アプリ、既存Migration、root依存/lock、Remote D1、Secrets、Cloudflare設定は未変更。

公式資料：
https://developers.cloudflare.com/workers/previews/
https://developers.cloudflare.com/workers/previews/compare-workflows/
https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API
