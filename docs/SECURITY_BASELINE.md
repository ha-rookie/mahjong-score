# Security Baseline

## 目的

公開Webアプリで、設定ファイルの存在ではなく**Productionの実レスポンス**を基準にSecurity Headersを確認する。

すべてのHeaderを増やすことを目的にせず、用途が明確なRecommended baselineを優先する。

## Recommended Baseline

| Header | 基本方針 |
| --- | --- |
| `Content-Security-Policy` | 外部script、style、image、connect先を必要最小限にする |
| `Strict-Transport-Security` | HTTPS恒久運用を前提にmax-ageを設定する |
| `X-Frame-Options` | 原則DENYまたはSAMEORIGIN。埋め込み要件がある場合はCSP `frame-ancestors`と整合させる |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | 送信するReferer情報を必要最小限にする |
| `Permissions-Policy` | camera / microphone / geolocation / accelerometer等をアプリ要件に合わせて明示する |
| `X-Permitted-Cross-Domain-Policies` | 原則 `none` |

## Content-Security-Policy

CSPはアプリ固有の外部通信要件に合わせる。

確認対象:

- script-src
- style-src
- img-src
- connect-src
- font-src
- frame-src / frame-ancestors
- worker-src
- manifest-src

外部CDN・Analytics・API・PWAを使う場合、Previewで必要通信を確認してからProductionへ適用する。

CSPを強くするためだけにアプリを壊さない。違反内容を確認し、必要な接続だけを許可する。

CSP reporting endpointは、受信先と運用方針を用意してから採用する。

## HSTS

基本候補:

```text
Strict-Transport-Security: max-age=31536000
```

`includeSubDomains` は、そのドメイン配下をすべてHTTPSで恒久運用できる場合のみ追加する。

`preload` は自動採用しない。解除まで時間がかかり得るため、独自ドメインを恒久的にHTTPS運用する明確なHuman decisionがある場合だけ検討する。

## Permissions-Policy

機能を無差別に許可しない。

例:

- 位置情報を使わないアプリ → geolocationを許可しない
- センサーアプリ → accelerometer / gyroscope等を必要範囲だけ許可
- microphone / cameraを使わない → 許可しない

機能要件とHeader設定が矛盾しないことを実機で確認する。

## Optional / Informational Header

外部診断の点数を上げる目的だけで追加しない。

用途が明確な場合に検討する例:

- Cross-Origin-Embedder-Policy
- Cross-Origin-Resource-Policy
- Cross-Origin-Opener-Policy
- Origin-Agent-Cluster
- Clear-Site-Data
- X-DNS-Prefetch-Control

`X-XSS-Protection` はdeprecatedなため、新規標準として追加しない。CSP等の現行ブラウザ向け対策を優先する。

## Cloudflare Pages

### Static

`public/_headers` 等でHeaderを設定できる。

ただし、Repository上の設定値が正しいことと、Productionで返るHeaderが正しいことは別問題として扱う。

### Pages Functions / Workers

FunctionsやWorkersを経由するレスポンスは、静的 `_headers` と同じHeaderが自動的に返るとは限らない。

そのため:

1. Function / Worker側のHeader設計
2. CIの静的確認
3. Deploy
4. Production smokeで実レスポンス確認
5. 必要時に外部診断

の順で確認する。

## Production Smoke

最低限、Production URLの実レスポンスでRecommended baselineを確認する。

概念例:

```bash
curl -I https://CHANGE-ME.example/
```

確認:

- Content-Security-Policy
- Strict-Transport-Security
- X-Frame-Options または同等のframe-ancestors設計
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- X-Permitted-Cross-Domain-Policies

Functions/APIがある場合、HTMLだけでなく重要な動的レスポンスも確認する。

## 外部診断

Security Headers外部診断は常時実行しない。

標準候補:

- SSL.org Security Headers Test: https://www.ssl.org/security-headers

実施条件:

- 初回公開
- Security Headers変更時
- Pages Functions / Workers導入等の大きなArchitecture変更時
- 公開ドメイン変更時
- Production smokeと外部挙動が一致しない時

上記のいずれかに該当する場合は、Production smoke成功だけでSecurity確認を完了扱いにせず、外部診断まで実施する。

診断後は最低限、以下をIssueまたはPull Requestへ記録する。

- 診断対象のProduction URL
- 実施日
- Recommended baselineのPresent状況
- Missing項目のうちOptional / Informationalを追加しない判断
- 必要な追加対応の有無

毎DeployではProduction smokeを使い、外部診断は上記条件に該当するときだけ実施する。

外部診断結果は「Present数」を競うのではなく、Recommended baselineが意図どおり返っているかを判断する。

## 検証の分担

```text
設定ファイル / Functionレスポンス設計
↓
CIの静的検証
↓
Preview
↓
Production Deploy
↓
Production response smoke
↓
必要時のみ外部診断
```

## 変更時の確認

Security Headerを変更する場合:

- 外部script / API / Analytics / PWAへの影響
- Sensor / Geolocation等へのPermissions-Policy影響
- iframe / embed要件
- custom domain / subdomainへのHSTS影響
- PreviewとProductionの差
- rollback方法

をIssueに記録する。
