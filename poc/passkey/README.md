# S0｜パスキー暗号基盤PoC（Node実行・実環境未検証）

- Parent: #335、S0: #337、Phase 4設計PR: #336
- Date: 2026-10-20
- Scope: **実アプリ・Worker・DBに接続しない隔離された合成WebAuthn Assertion暗号テスト**。

## 実行

Node.js 22以降で、Repository rootから以下を実行。

```bash
node poc/passkey/crypto-smoke.mjs
```

npmインストール、Cloudflare Secrets、Remote D1、ネットワーク接続は不要。Productionに導入しない。Node標準のWeb Cryptoで署名検証を行う。

## 結果（2026-10-20 / Node.js v22.16.0）

**10/10 PASS**。さらに、鍵とChallengeを作り直す30回の反復実行で **300/300 assertions PASS**。Nodeの構文チェック（`node --check`）もPASS。いずれもローカル検証であり、Cloudflare Workersの実行結果ではない。

- ECDSA P-256 SHA-256（ES256）の署名生成/検証、WebAuthn想定DER署名とWebCrypto raw署名の変換。
- Challenge/Origin/RP ID不一致、User Presence/User Verification不足、署名改ざん、未知のCredentialの拒否。
- デモ上のChallenge一回消費、二重使用拒否。

**この結果が証明すること:** Node Web Crypto上での合成Assertion暗号検証の基本構造が実行できること。

**この結果が証明しないこと:** SimpleWebAuthn packageのWorker bundle互換、Cloudflare Workers実行、実際のBrowser/Authenticator/COSE/CBOR attestation対応、D1 Challenge原子性、iPhone/Android実機、Production/Preview originとRP ID、WebAuthnの端から端までの認証。

本ファイルは教育用/実験用の最小サンプルであり**安全なWebAuthnライブラリの代用品ではない**。アプリ本体へコピー・利用しない。

## 外部仕様確認（実行検証と混同しない）

- Cloudflare Workers Web CryptoのECDSA: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- SimpleWebAuthnのdiscoverable credential / usernameless sign-in（allowCredentials空配列）: https://simplewebauthn.dev/docs/advanced/passkeys/
- SimpleWebAuthn Serverの公式使用法（採用バージョンは後続検証で固定）: https://simplewebauthn.dev/docs/packages/server
- Cloudflare Worker PreviewのURL・分離: https://developers.cloudflare.com/workers/previews/
- Cloudflare D1 batchのSQL例外時Rollback: https://developers.cloudflare.com/d1/worker-api/d1-database/

## S0に残る必須ゲート（未検証）

1. `@simplewebauthn/server`を固定した検証用Node/Worker bundle構築、実際の`generateRegistrationOptions`/`verifyRegistrationResponse`/`verifyAuthenticationResponse`をCloudflare Workers上で検証。互換性フラグ、依存関係、バンドルサイズを証跡化。
2. 本番実際のHTTPS配信hostnameとPreview originを読み取りで確定し、RP IDとPreviewの分離戦略を定める。推測でProduction domainを固定しない。
3. 本番D1を使わずiOS Safari/Android Chrome/ホーム画面Web AppでPasskey登録と再ログインの実機検証。
4. S1に移る前にisolated local D1で招待の一度限り利用、同時登録、rollback、SQL changes=0時のfail-closedを検証。
5. 既存LINE Login、招待、Player↔User紐付け、ユーザーごとの認可は再利用する。

**STOP:** Worker実証、RP ID実値、招待原子性の裏付けなしに本番の認証機能へ統合しない。

## Change Contract

このS0 PRは **poc/passkey/crypto-smoke.mjs** と本ファイルだけ。既存Worker、UI、package.json、wrangler、Migration、Remote D1、Secrets、Cloudflare設定、main/Productionは変更しない。
