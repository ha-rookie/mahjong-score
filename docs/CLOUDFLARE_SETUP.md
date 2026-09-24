# Cloudflare Setup

## 1. Readiness Check

- [ ] GitHub Repository接続権限
- [ ] Production Branch
- [ ] Build Command
- [ ] Output Directory
- [ ] Node.js version
- [ ] Environment Variables
- [ ] Secrets
- [ ] Bindings
- [ ] Analytics Engine
- [ ] Web Analytics
- [ ] Domain / DNS

## 2. 標準配信経路

Webアプリの標準候補は **GitHub Actions → Wrangler → Cloudflare Pages** とする。

Cloudflare DashboardのGit連携Buildを必須経路にはしない。アプリごとに採否は判断できるが、複数アプリで同じGitHub Actions + Wrangler方式を再現できる状態を優先する。

Repository Secrets候補:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

SecretsはFrontend、ログ、Issue本文、公開設計書へ露出しない。

## 3. Hello World Gate

機能実装前に最小構成をDeployし、PreviewとProductionの配信経路を確認する。

確認項目:

- mainからProduction Deployできる
- 非main Branch / PRからPreview Deployできる
- HTTPSで表示できる
- Output Directoryが正しい
- Secrets / Variables / Bindingsが想定どおり
- Production smokeが通る

Hello World Gateが失敗中は、原因を切り分けず機能実装へ進まない。

## 4. Pages Project Bootstrap

Pages Projectが存在しない場合は、Wranglerからの作成を標準候補にする。

概念例:

```bash
npx wrangler pages project create CHANGE-ME_PROJECT_NAME
npx wrangler pages deploy CHANGE-ME_OUTPUT_DIR --project-name=CHANGE-ME_PROJECT_NAME
```

### Project名

- 個人名、ニックネーム、アカウント名等を明示的な許可なく含めない
- 公開URLへ出ても問題ない中立的な名前を使う
- Project createが1回失敗しても方式全体の失敗と決めつけない
- 命名衝突、API Token権限、Account ID、Cloudflare側状態を分けて確認する
- 既存の成功アプリとWorkflow・Secrets・Wrangler versionを比較する

## 5. Environment Separation

ProductionとPreviewを分離する。

最低限分ける対象:

- Cloudflare Pages Project
- Environment Variables
- Secrets
- Bindings
- 書き込み先
- Analytics backend
- 外部サービスのProduction credential

PreviewからProductionデータへ書き込まない。

Production / Previewを同一Projectで運用する場合でも、Bindings・Variables・データ境界が明確であることを設計書へ残す。

## 6. Production Workflow

Template Repository自身ではProduction Deployを自動実行しない。

新規アプリでCloudflare設定とSecretsを確定した後、`docs/workflow-templates/deploy-production.yml` を `.github/workflows/` へコピーし、CHANGE-MEを置き換えて有効化する。

有効化前に確認する:

- Project名
- Output Directory
- Wrangler version
- Production branch
- Secrets
- build/test command
- Functions / Workersの有無
- smokeで確認するURL/marker

## 7. Production Smoke

Deploy成功だけでRelease完了としない。stable Production URLの実レスポンスを確認する。

最低限:

- HTTP 200
- HTTPS
- 想定したHTML marker / application-name等
- 主要静的Asset
- 必要なAPI / Functions
- Security Headers
- Preview用noindexがProductionへ誤適用されていないか、または意図したnoindexか
- Production URLが最新mainを配信していること

titleの文言など変更されやすい値だけをsmoke markerにしない。アプリ固有の安定markerを選ぶ。

## 8. Domain・SEO

HTTPS、www有無、canonical、title、description、OGP、favicon、robots.txt、sitemap.xml、Preview noindexを確認する。

Productionをindex公開するか、noindexのまま限定共有するかはHuman decisionとする。

## 9. Security

秘密情報をRepositoryへ入れない。Security Headersはbaselineから導入する。CSPは外部script、Beacon、PWA、same-origin APIをPreviewで確認してから強制する。

静的 `_headers` が存在しても、Pages Functions等の動的レスポンスで同じHeaderが返るとは限らない。本番レスポンスを実測する。

## 10. Analytics

Production受信を確認し、Previewを本番計測から除外する。Analytics側の未設定とアプリのBuild失敗を分ける。

Analyticsを導入しない判断も有効。導入有無は利用目的・Privacy・運用コストを踏まえてHuman decisionとする。

## 11. Operations

Deploy履歴、ログ、前回正常版、Rollback、障害時判断、データ更新方法を記録する。

### Rollback

重大な回帰時は、直前の正常Production deploymentまたは直前の正常main commitを特定する。

- mainをforce updateしない
- revert PRを基本にする
- rollback対象と理由をIssue/PRへ残す
- rollback後もProduction smokeを行う

## 12. Pages Project作成失敗時の切り分け

1. Project名が既存Projectと衝突していないか
2. Project名に不適切な個人識別文字列を使っていないか
3. `CLOUDFLARE_API_TOKEN` が設定済みか
4. TokenにPages編集権限があるか
5. `CLOUDFLARE_ACCOUNT_ID` が正しいか
6. Wrangler version / commandが既存成功例と同じか
7. Project createだけ失敗しているか、deployも失敗しているか
8. 別の中立的なProject名で再現するか
9. Cloudflare側障害・APIエラーか

1回の失敗だけで「手動作成が必要」「Wrangler方式は使えない」と判断しない。

## 13. Design Previewとの責務分離

Design Previewは `docs/DESIGN_PREVIEW.md` の標準に従い、視覚設計レビュー専用の配信面として扱う。

Production App Preview / Production Deployとは別物とする。

- Design Preview: HTML設計・見た目・画面構造の確認
- App Preview: 実装Branch / PRの実アプリ確認
- Production: mainの承認済み成果物

Production用Functions/Workers/BindingsをDesign Previewへ混入させない。


## 14. 関連文書

- `DESIGN_PREVIEW.md`: Design専用Pages Project / Preview alias / noindex
- `SECURITY_BASELINE.md`: Recommended Security Headers / Production実測
- `PUBLIC_WEB_QUALITY.md`: SEO / Search Console / Public Trust / index判断
- `RELEASE_CHECKLIST.md`: Production verification / Release完了条件


## 15. Mahjong Score Phase 2 Gate

Phase 2ではD1導入前に次を完了する。

1. Worker Previewsをbranch検証面として構成する
2. PreviewをCloudflare Accessで保護する
3. Production / PreviewのBindingsを分離する
4. Preview D1とProduction D1を別databaseとして作成する前提を確認する
5. GitHub ActionsのCloudflare tokenにD1操作の必要最小権限を追加する場合は、既存Workers deploy権限を壊さないことを確認する

### Access scope

初期GateではPreview保護を必須とする。Production全面保護はLINE Login導入前の利用継続性に影響するためHuman decisionとし、無断で切り替えない。

### D1 isolation

Worker PreviewはD1を自動分離しない。同じdatabase_idを指定したPreview同士は同じrowを共有するため、PreviewはProductionとは別のD1 resourceへbindingする。

### Current repository gap

`wrangler.jsonc` で `preview_urls: true` と空の `previews` blockを明示し、Worker Previewsの基盤を有効化する。D1 resource IDが存在しない段階では架空IDをRepositoryへ追加しない。WranglerはWorker Previews対応の4.135.0を使用する。


## 16. Mahjong Score D1 Resources

Created 2026-09-24:

- Production: `mahjong-score-prod` / binding `DB`
- Preview: `mahjong-score-preview` / binding `DB`

Production and Preview use separate D1 resources. Database UUIDs are configured in `wrangler.jsonc`; they are resource identifiers, not authentication secrets. Do not replace either binding with the other environment's database.
