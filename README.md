# AI Driven Web App Template

AIと人間でWebアプリを継続開発するための標準テンプレートです。

コードの雛形だけでなく、設計、Issue、Branch、Pull Request、CI、Cloudflare、Asset、Security、SEO、Search Console、リリース、公開後確認、知見還流までを一つのGolden Pathとして管理します。

## 基本原則

1. 設計変更 → 設計書 → Issue → 実装 → テスト → Pull Request
2. 1 Issue・1 Branch・1 Pull Request
3. mainを直接変更しない
4. 通常PR＋人間承認ゲートを標準とする
5. Previewでスマホ確認してからProductionへ反映する
6. ProductionとPreviewのデータ・Bindingsを分離する
7. 失敗をKnown Issue、手順、テンプレート、CIへ順に昇格する
8. GitHubのmainを承認済み設計の正本とする
9. 設計書ごとの責務を分け、同じ事実を複数文書へ重複管理しない
10. CIは品質ゲートであると同時に有限の実行資源として扱う
11. PWA・Analytics・検索index公開・LLMO等は一律必須にせずHuman decisionを残す
12. Merge / Deploy成功だけでRelease完了とせず、Production実測・実機確認・設計書同期まで行う

## Golden Path

アイデア → 企画 → 要件 → Architecture → UI設計 → Issue → Branch → 実装 → CI → Preview → 人間レビュー → Merge → Production Deploy → Production Verification → 設計書同期 → 公開後観測 → 振り返り / 知見還流

## 使い始めるとき

- `docs/00_PROJECT_OVERVIEW.md` のCHANGE-MEを置き換える
- `docs/01_REQUIREMENTS.md` に機能・非機能要件を定義する
- `docs/02_SYSTEM_ARCHITECTURE.md` でHosting、外部Service、データ経路、環境分離を設計する
- `docs/03_APPLICATION_ARCHITECTURE.md` でModule責務、State、Data、IFを設計する
- `docs/04_REPOSITORY_STRUCTURE.md` を実際のRepository treeへ合わせる
- 重要な技術判断は `docs/adr/` に残す
- UIの認識差が出る場合は `docs/design/` でVisual Designを作る
- Design Previewが必要なら `docs/DESIGN_PREVIEW.md` に従いWorkflow Templateを有効化する
- CloudflareのHello World Gateを先に通す
- Production配信が必要なら `docs/workflow-templates/deploy-production.yml` をアプリ側へコピーしてCHANGE-MEを置き換える
- Security baseline、公開範囲、index/noindex、About/Privacy、GSC、PWA、Analyticsの採否を決める
- 必要なIssueをテンプレートから作る
- Release Checklistをプロジェクトに合わせて更新する

## 設計書の管理

設計書の入口は [Design Documentation Index](docs/README.md) とする。

- 承認済み最新設計: GitHub `main`
- 提案中設計: PR Branch
- 視覚レビュー: `docs/design/` + 必要に応じDesign Preview
- 設計判断履歴: `docs/adr/`
- 構築キャプチャー・外部資料: Google Drive
- 複数アプリで再利用する開発判断: Notion
- Chat上の確定事項: 必ず該当設計書へ反映

詳細は [Design Management](docs/05_DESIGN_MANAGEMENT.md) を参照する。

## 文書

### Core Design

- [Design Documentation Index](docs/README.md)
- [Project Overview](docs/00_PROJECT_OVERVIEW.md)
- [Requirements](docs/01_REQUIREMENTS.md)
- [System Architecture](docs/02_SYSTEM_ARCHITECTURE.md)
- [Application Architecture](docs/03_APPLICATION_ARCHITECTURE.md)
- [Repository Structure](docs/04_REPOSITORY_STRUCTURE.md)
- [Design Management](docs/05_DESIGN_MANAGEMENT.md)
- [Requirements Traceability](docs/06_REQUIREMENTS_TRACEABILITY.md)
- [Visual Design](docs/design/README.md)
- [Design Preview](docs/DESIGN_PREVIEW.md)
- [Architecture Decision Records](docs/adr/README.md)

### Development / Operations

- [Git Workflow](docs/GIT_WORKFLOW.md)
- [Asset Workflow](docs/ASSET_WORKFLOW.md)
- [Cloudflare Setup](docs/CLOUDFLARE_SETUP.md)
- [Security Baseline](docs/SECURITY_BASELINE.md)
- [Public Web Quality](docs/PUBLIC_WEB_QUALITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)

### Workflow Templates

Template Repository自身ではCloudflareへ自動Deployしない。

新規アプリで利用する場合に、以下を `.github/workflows/` へコピーしてCHANGE-MEを置き換える。

- `docs/workflow-templates/deploy-production.yml`
- `docs/workflow-templates/deploy-design-preview.yml`

## v0.2の位置づけ

v0.1は朝マズメ潮ナビを中心に、GitHub設計正本・Issue/PR運用・HTML Design Preview・Cloudflare公開の骨格を抽出した初版だった。

v0.2では、その後の**朝マズメ潮ナビ、あと一杯ナビ、よう拝（遥拝）アプリ、くるくるソムリエ**等の実開発で繰り返し有効だった知見をTemplateへ還流した。

主な追加・強化:

- GitHub Actionsの利用量・重複実行・rerun判断
- OGP / favicon / PWA iconのAssetライフサイクル
- Git Blob + Base64による画像輸送の判断基準
- GitHub Actions + Wrangler + Cloudflare Pagesのbootstrap / Production経路
- Production / Preview / Design Previewの責務分離
- Recommended Security HeadersとProduction実測
- SEO / Search Console / About / Privacy / Public Trust
- 検索公開 / URL限定共有のHuman decision
- Production Verificationと設計書同期
- 公開後の知見をNotion → GitHub Templateへ還流するループ

個別アプリ固有のロジックや、LitLink・ProtoPedia固有の運用はTemplateへ直接固定せず、再利用できる原則だけを標準化する。
