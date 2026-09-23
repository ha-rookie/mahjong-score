# Release Checklist

## 0. Releaseの定義

**Merge成功 / Deploy成功だけではRelease完了としない。**

Release完了は、承認済みmainがProductionへ配信され、実際のProduction URL・主要フロー・公開品質を確認し、必要なら設計書を同期した状態とする。

```text
CI success
↓
Human approval
↓
Merge
↓
Production Deploy
↓
Production verification
↓
実機確認
↓
設計書同期
↓
Issue Close / Lessons Learned
```

## 0.5 Risk / Impact 適用範囲

このChecklistは**Production Releaseへ影響する変更のFull Checklist**として扱う。すべてのPRへ全項目を機械的に要求しない。

- Runtime impact = No: Production Release Checklistは原則不要。Issue / PRのValidationで完了判定する
- Runtime impact = Yes かつ Low / Medium: 該当するSectionだけ適用する
- High: 原則Full Checklist。適用除外がある場合は理由を記録する
- UI / Mobile / Sensor / Asset / Security / Public Repository等は、IssueのImpact Flagsに応じて該当Sectionを追加する
- Design / Operation Meaning = Yes: main確定後にNotion最終設計同期を確認する
- Design / Operation Meaning = No: Notionを形式的に更新せず、Issue / PRへ更新不要を記録する

Human Merge approval、Evidence Before Claim、必要なProduction VerificationはRisk軽量化の対象外とする。

## 1. 設計・Issue

- [ ] 要件と非対象が明確
- [ ] 設計書更新済み、または更新不要の理由を記録
- [ ] 受け入れ条件が検証可能
- [ ] Security・SEO・データ・運用影響を確認
- [ ] rollback / recovery方法を確認
- [ ] 公開範囲（検索公開 / URL限定共有）を決定

## 1.5 Public Repository Gate（Public化する場合）

### Public化前

- [ ] `.github/workflows/fork-monitor.yml` がdefault branchに存在
- [ ] RepositoryのIssuesが有効
- [ ] Secret / token / credential / 個人情報 / 非公開資料 / 公開禁止Assetを公開しないことを確認

### Public化直後

- [ ] HumanがGitHub UIでRuleset `main protection` を作成
- [ ] 管理権限を持つPAT / GitHub App / WorkflowでRulesetを自動作成していない
- [ ] AIは作成後のRulesetをRead-only APIで実測確認
- [ ] Enforcement = Active
- [ ] Target = Default branch
- [ ] Bypassなし
- [ ] Restrict deletions = ON
- [ ] Require a pull request before merging = ON
- [ ] Required approvals = 0
- [ ] Require conversation resolution before merging = ON
- [ ] Allowed merge methods = Merge / Squash
- [ ] Block force pushes = ON
- [ ] PR用CIがある場合、Repository固有のRequired status checksを登録
- [ ] Required status checks採用時、Require branches to be up to date before merging = ON

GitHub TemplateのSettings / Rulesetは派生Repositoryへ引き継がれないため、Public化するRepositoryごとに作成する。Template Repository自身をPublic化する場合も同じ。

### 実測確認

- [ ] GitHub API等でvisibility = publicを確認
- [ ] default branch上のFork monitor実体を確認
- [ ] Rulesetの存在とenforcement = activeを確認
- [ ] default branch対象、deletion禁止、PR必須、conversation resolution、merge method、force push禁止を確認
- [ ] bypassなしを確認
- [ ] Required status checks採用時、check名とup-to-date設定を確認
- [ ] **Public Repository Gate = Passed** をIssue / PRへ記録

## 2. Code・CI

- [ ] lint・test・build成功
- [ ] 静的データ検証成功
- [ ] 秘密情報なし
- [ ] 主要回帰なし
- [ ] 同一原因の不要なrerunをしていない
- [ ] review対象head SHAを特定

## 3. Preview

Previewが必要な変更の場合:

- [ ] Preview Deploy成功
- [ ] スマホ実機確認
- [ ] 必要に応じシークレットモード確認
- [ ] PreviewからProductionデータへ書き込まない
- [ ] Previewが検索index対象になっていない
- [ ] Production Analyticsを汚染しない
- [ ] 人間承認と承認head SHAを記録

Preview省略をHuman decisionした場合:

- [ ] 省略理由をIssue / PRへ記録
- [ ] Productionで代替確認する項目を明記

## 4. UI・Asset

UI / Asset変更がある場合:

- [ ] 折り返し、選択、focus、disabledを確認
- [ ] 色だけに依存していない
- [ ] 承認済みAssetまたは承認済み生成元を使用
- [ ] 画像欠落・参照切れなし
- [ ] 小サイズ/モバイルで意味が伝わる

OGP変更時:

- [ ] OGP metadataと実画像が一致
- [ ] Productionの `og:image` を取得可能
- [ ] LINE等の実共有先でカード確認、または確認不可理由を記録

favicon / App Icon変更時:

- [ ] favicon
- [ ] Apple Touch Icon
- [ ] 192x192
- [ ] 512x512
- [ ] maskable icon
- [ ] 正本から再生成可能、または原本hashを記録

## 5. SEO・Public Trust

検索公開する場合:

- [ ] title・description・canonical
- [ ] OGP・favicon
- [ ] robots.txt
- [ ] sitemap.xml
- [ ] Productionが意図せずnoindexになっていない
- [ ] JSON-LDの要否を確認
- [ ] About / Footer
- [ ] Disclaimer / Privacyの要否
- [ ] Source / 一次情報導線の要否

URL限定共有の場合:

- [ ] Productionのnoindex/nofollowを確認
- [ ] Search Console登録を延期するか記録
- [ ] About / Privacy等の公開品質は維持

## 6. Security

- [ ] Recommended Security Headers baselineを確認
- [ ] CSP
- [ ] HSTS
- [ ] X-Frame-Optionsまたは同等設計
- [ ] X-Content-Type-Options
- [ ] Referrer-Policy
- [ ] Permissions-Policy
- [ ] X-Permitted-Cross-Domain-Policies
- [ ] Pages Functions / Workersがある場合、動的レスポンスも確認
- [ ] 初回公開 / Header変更 / 大きなArchitecture変更 / 公開ドメイン変更に該当する場合、SSL.org等で外部Security Headers診断を実施
- [ ] 外部診断の対象URL・実施日・Recommended項目の結果・追加対応判断をIssue / PRへ記録

## 7. Cloudflare・Runtime

- [ ] Variables・Secrets・Bindings
- [ ] ProductionとPreviewの境界
- [ ] Production Deploy成功
- [ ] stable Production URLを特定
- [ ] deployment URL / deploy historyを確認
- [ ] 前回正常版を特定可能
- [ ] Rollback手順確認

## 8. Production Verification

Deploy成功後、**stable Production URLを実測**する。

最低限:

- [ ] HTTP 200
- [ ] HTTPS
- [ ] 正しいApplication / stable marker
- [ ] 最新main相当の画面・機能
- [ ] 主要静的Asset
- [ ] 主要ユーザーフロー
- [ ] API / Pages Functions / Workersの実レスポンス
- [ ] Security Headers
- [ ] console / networkに重大エラーなし
- [ ] 通常スマホブラウザ
- [ ] シークレットモード

アプリの特性に応じて:

- [ ] 位置情報
- [ ] DeviceMotion / DeviceOrientation
- [ ] カメラ / マイク
- [ ] 外部API
- [ ] ローカル保存
- [ ] Offline / cache

## 9. PWA（採用時のみ）

- [ ] manifest取得
- [ ] icon参照
- [ ] service worker
- [ ] installability
- [ ] ホーム画面追加
- [ ] standalone起動
- [ ] 主要ユーザーフロー
- [ ] update / cacheの重大問題なし

PWA非採用の場合は「非採用」と判断を記録する。

## 10. Analytics（採用時のみ）

- [ ] Production受信
- [ ] Previewを本番計測から除外
- [ ] smoke testイベントと実利用イベントを区別可能
- [ ] Privacy記載と実装が一致
- [ ] 個人識別/位置情報等の収集範囲を確認

Analytics非採用の場合は「非採用」と判断を記録する。

## 11. Google Search Console（検索公開時のみ）

- [ ] Property作成
- [ ] 所有権確認
- [ ] 確認ファイルをProductionで取得可能
- [ ] URL検査
- [ ] 公開URLライブテスト
- [ ] index request
- [ ] sitemap.xml送信

公開直後に完了しないもの:

- [ ] 翌日以降にindex状態を確認
- [ ] 下位ページのクロール状態を確認
- [ ] 検索パフォーマンス観測開始

Search Consoleの後日観測はRelease失敗とは扱わない。公開後運用タスクとして追跡する。

## 12. Production実態と設計書の同期

Production確認後:

- [ ] 実装と設計書の差分を確認
- [ ] 公開URL / Project名 / Architectureが設計書と一致
- [ ] Human decision（index / Analytics / PWA等）を設計書へ反映
- [ ] 変更された運用手順を更新
- [ ] 公開後に判明した制約をKnown Issueへ反映

「実装が正しくて設計書が古い」状態も未完了として扱う。

## 12.5 Notion最終設計同期

- [ ] mainの確定実装とNotion最終設計の差分を確認
- [ ] 設計・仕様・運用変更がある場合はNotionを同期
- [ ] 設計変更がない場合はIssue / PRへ「Notion更新不要」を記録
- [ ] Open Issueだけで実装状態を判断せず、対応Branch / PR / mainを確認

## 13. Issue Close Evidence

Issue / PRへ最低限残す:

- Production URL
- 対象commit / merge commit
- Production deploy run
- Production smoke結果
- 実機確認内容
- Human approval
- 既知の未完了事項
- rollback先

後日観測が必要なものは別Issue / Taskとして分離する。

## 14. Lessons Learned / Notionへの昇格

Release後、今回の事象が他アプリでも再利用できるか判断する。

- [ ] 個別アプリ固有 → 当該Repositoryだけに残す
- [ ] 再発可能な障害 → TROUBLESHOOTINGへ
- [ ] 手順として再利用可能 → docsへ
- [ ] 強制できる規約 → Template validation / CIへ
- [ ] 複数アプリ横断の判断知識 → Notion「AI駆動開発｜実践・設計ハブ」へ

Known Issue → 手順 → Template → CI の順に、再発する判断コストを減らす。

## 15. Release完了判定

以下を満たしてRelease完了とする。

- [ ] CI成功
- [ ] Human approval
- [ ] Merge
- [ ] Production Deploy
- [ ] Production Verification
- [ ] 必要な実機確認
- [ ] 設計書同期
- [ ] Issue Close Evidence
- [ ] 後日観測タスクの分離
