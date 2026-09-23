# Design Management

## 1. 目的

設計を「文書を作る作業」ではなく、変更判断・実装・テスト・レビューをつなぐ制御面として管理する。

## 2. 設計の正本

- 承認済み最新設計: GitHub `main`
- 提案中設計: 対象IssueのBranch / Pull Request
- 変更履歴: Git history / Pull Request
- 重要判断の理由: `docs/adr/`
- 視覚レビュー: `docs/design/` を元にしたDesign Preview
- 構築証跡: Google Drive
- Chat: 作業会話。確定仕様の正本にはしない

## 3. 朝マズメ潮ナビとの関係

継承する:

- GitHub設計書を正本にする
- 要件 / Architecture / HTML視覚設計を分ける
- 設計Previewを人間がブラウザ・スマホで確認する
- Design承認後に実装する

改善する:

- 文書の責務表を固定する
- System ArchitectureとApplication Architectureを分離する
- Repository Structureを独立させる
- ADRを標準化する
- Requirements Traceabilityを最初から持つ
- Google DriveとGitHubの役割を明文化する

## 4. 変更規模別フロー

### Small Change

仕様境界を変えない軽微な変更。

```text
Issue
 -> same branchで設計書を先に更新
 -> implementation
 -> test
 -> PR
 -> human review
 -> merge
```

### Significant Design Change

Architecture、画面構造、データschema、認証、課金、外部IF、Asset大変更など。

```text
Design Issue
 -> Design Branch
 -> design docs / visual preview
 -> human approval
 -> Design PR merge
 -> Implementation Issue
      references approved Design PR / SHA / IDs
 -> Implementation Branch
 -> code/test/preview
 -> human approval
 -> merge
```

設計を別PRにするかは「人間が実装前に設計だけを承認する必要があるか」で判断する。

## 5. 更新トリガー

| Change | Required Docs |
| --- | --- |
| 目的・対象ユーザー | 00_PROJECT_OVERVIEW |
| 機能/非機能要件 | 01_REQUIREMENTS + 06_TRACEABILITY |
| Hosting/外部Service/DB/Runtime構成 | 02_SYSTEM_ARCHITECTURE + ADR |
| Module/State/API/Data Model | 03_APPLICATION_ARCHITECTURE |
| File/Folder配置 | 04_REPOSITORY_STRUCTURE |
| UI/画面/Interaction | design/ + 必要に応じ03 |
| Cloudflare手順 | CLOUDFLARE_SETUP |
| Design Preview | DESIGN_PREVIEW + design/ |
| 公開品質・SEO・GSC | PUBLIC_WEB_QUALITY |
| Security Header | SECURITY_BASELINE |
| Asset | ASSET_WORKFLOW + Feature Issue Asset Handoff |
| Release条件 | RELEASE_CHECKLIST |
| 再発可能な障害 | TROUBLESHOOTING |
| 重要な選択理由 | adr/ |

## 6. 設計IDとIssue/PR

Issueには可能な範囲で以下を記載する。

- 対象REQ/NFR
- 対象ARCH/APP/UI/DATA/IF
- 新規TBD
- 関連ADR
- 更新する設計書
- 変更しない設計境界

PRでは「設計書を更新したか」だけでなく、どのIDが変わったか確認する。

## 7. Versioning

ファイル名へ `v2`、`final`、`final2` を増殖させない。

- 最新承認版 = main
- 過去版 = Git history
- Release時点 = Git tag / Release
- 提案版 = PR Branch
- 廃止判断 = ADRまたはIssue/PR

例外として外部提出物など固定スナップショットが必要な場合だけ別Artifactを作る。

## 8. ADR

重要な設計判断は上書きで消さない。

- Accepted ADRを変更したい場合、新ADRでSupersedeする
- 過去判断が当時なぜ妥当だったか残す
- 単なる実装メモや小さな命名判断はADRにしない

## 9. Requirements Traceability

`06_REQUIREMENTS_TRACEABILITY.md` で以下を結ぶ。

```text
Requirement
 -> Design ID / ADR
 -> Issue
 -> Implementation
 -> Test
 -> Status
```

要件をDeferred/Removedへ変える場合は理由を残す。

## 10. Visual Design / HTML Design

画面やInteractionは、文章だけで認識差が出る場合 `docs/design/` でブラウザ確認可能にする。

朝マズメ潮ナビと同様、必要ならCloudflare Design Previewを使う。

ただし:

- Design Previewは正本ではない
- 正本はRepository内のHTML/CSS/設計ファイル
- ProductionサイトとDesign Previewを混在させない
- 検索エンジンへ公開しない
- 可能ならAccess制御する
- PR単位Previewとmain最新Previewを区別する
- スマホで確認する

Design Previewの自動デプロイ自体はプロジェクト開始時に必要性を判断する。

有効化する場合は `DESIGN_PREVIEW.md` を正本とし、PR=`pr-N`、main=`latest`、manual=`manual-<run_id>` のPreview aliasを基本候補とする。Template Repository自身ではDesign Previewを自動Deployしない。

## 11. Google Drive

Google Driveへ置くもの:

- Cloudflare/GitHub設定画面キャプチャー
- 外部ツールの証跡
- 手動操作の記録
- PDF等の参考資料
- GitHubへ置くべきでない大きな参照資料

Google Driveへ設計本文のコピーを作り、GitHubと二重管理しない。

必要ならDrive文書からGitHubの設計書・Issue・PRへリンクする。

## 12. Review Checklist

設計レビューでは最低限確認する。

- Requirementとの整合
- 変更範囲と非対象
- System / App / Repository責務の混在がない
- Production / Preview分離
- Security / privacy
- Failure / fallback
- Mobile / accessibility
- Data source / freshness
- Testability
- Rollback
- TBDを勝手に確定していない
- 重複する正本を作っていない

## 13. 設計負債

実装を優先して設計更新を後回しにした場合、完了扱いにせずIssue化する。

「コードが動いているから設計は不要」を標準にしない。
