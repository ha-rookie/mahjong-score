# Design Preview

## 目的

HTML/CSS等で作成した視覚設計を、Production Applicationへ実装する前にブラウザ・スマートフォンでレビューするための配信面。

Design Previewは**表示面**であり、設計の正本はRepository内の `docs/design/` と関連設計書・Issue・PRにある。

## Productionとの分離

Design PreviewとProduction Applicationを同じものとして扱わない。

- Design Preview: 視覚設計、画面構造、状態、Interactionのレビュー
- App Preview: 実装Branch / PRの動作確認
- Production: 承認済みmainの実サービス

Design PreviewへProduction用Functions / Workers / Bindings / Secrets / Analytics backendを持ち込まない。

## Directory

```text
docs/
├─ design/
│  ├─ README.md
│  ├─ index.html
│  └─ _headers
├─ design-public/
│  ├─ index.html
│  └─ _headers
└─ workflow-templates/
   └─ deploy-design-preview.yml
```

- `docs/design/`: レビューする設計面
- `docs/design-public/`: Design用Cloudflare Pages Projectのproduction apexに置く非公開placeholder
- `docs/workflow-templates/`: 新規アプリで有効化するWorkflow Template

## URL命名

標準候補:

- Pull Request: `pr-<PR番号>`
- main最新設計: `latest`
- workflow_dispatch: `manual-<run_id>`

Cloudflare Pagesのhash deployment URLはスナップショットとして扱う。

## 検索エンジン対策

Design Previewは原則indexさせない。

- HTML `meta robots=noindex,nofollow`
- `X-Robots-Tag: noindex, nofollow`
- sitemapへ含めない
- Production canonicalを付与しない
- 公開検索導線からリンクしない

Access制御を利用できる場合は追加してよいが、Accessがないことを理由にnoindex等を省略しない。

## Security

Design Previewは本番データを扱わない前提でも、最低限のSecurity Headerを持つ。

- Content-Security-Policy
- Strict-Transport-Security
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- X-Permitted-Cross-Domain-Policies

センサーや外部API等をDesign Previewで本当に検証する必要がある場合は、そのIssueで必要権限を明示的に緩和する。

## Cloudflare Pages Project

Design Preview専用ProjectをProduction App Projectと分ける。

設定候補:

- Project name: `CHANGE-ME_DESIGN_PROJECT`
- Production placeholder source: `docs/design-public/`
- Review source: `docs/design/`
- Repository Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

Project名へ個人名・ニックネーム等を無断で含めない。

## 初期化

1. Design用Pages Projectを作成
2. `docs/design-public/` をproduction apexへ一度配信
3. `docs/workflow-templates/deploy-design-preview.yml` を `.github/workflows/` へコピー
4. CHANGE-MEを置換
5. workflow_dispatchで動作確認
6. PRを作り `pr-N` previewを確認
7. main更新時に `latest` previewを確認

## Review Flow

```text
Design Issue
↓
Design Branch
↓
docs/design更新
↓
Design Preview deploy
↓
スマホ/ブラウザ確認
↓
Human approval
↓
Design PR merge
↓
Implementation Issueへ承認head SHA / Design IDsを引き継ぐ
```

## Human Review

最低限:

- スマートフォン実機
- 主要viewport
- 折返し
- タップ領域
- focus
- selected / disabled
- loading / empty / error
- accessibility
- design intent
- Production実装との差分が説明可能

## 無効化

Design Previewが不要なプロジェクトではWorkflowを有効化しない。

Template Repository自身ではDesign Previewを自動Deployしない。
