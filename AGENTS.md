# AGENTS.md

## 目的

AIは、速くコードを書くことより、設計・証跡・レビュー可能性・安全な回復を優先する。

## 作業開始時の必須ガードレール

Humanとの共同作業では、最初に `docs/HUMAN_AI_COLLABORATION.md` を確認する。特にGitHub URLの提示、画像等バイナリの受け渡し、画像生成、新規制作への工程遷移では、同文書のSTOP Gateを実行前に適用する。Repository固有ルールはこの共通ガードレールを暗黙に弱めてはならない。外部サービスのQuota・権限・障害等がある場合はGR-007を適用し、実行されていないCI / Preview / Deploy等を成功・確認済みとして扱わない。

## 作業復帰時の必須ガードレール

新しいチャットや中断後、またはHumanとの認識不一致が生じた場合は `docs/HUMAN_AI_COLLABORATION.md` の **GR-008** を適用し、過去チャットの記憶や単一の検索結果だけから現在地・不存在・未実装を決めない。既知のpath / SHA / Issue / Branch / PRがある場合は、検索結果より直接Evidenceを優先する。

- Notionの最終設計・現在地を確認する
- Open Issueは変更仕様として読む
- 対応Branch / PRを確認し、実装途中の事実を読む
- mainとの差分とMerge状態を確認する
- 必要な場合だけGoogle Driveの作業データを確認する
- Boxは普遍的な原典・生データの確認が必要な場合だけ参照する
- Open Issueだけを根拠に「未着手」「未実装」と判断しない

Humanから「前にやった」「認識が違う」「それではない」「もう実装したはず」等の指摘があった場合は推測を停止し、Issue → Branch / PR → main → 必要な作業データをRead-onlyで確認して差分を特定する。

## 設計書の読み方

作業開始時は `docs/README.md` を入口にし、変更内容に対応する正本を読む。

- 目的・対象: `docs/00_PROJECT_OVERVIEW.md`
- 機能/非機能要件: `docs/01_REQUIREMENTS.md`
- System全体構成: `docs/02_SYSTEM_ARCHITECTURE.md`
- App内部構成: `docs/03_APPLICATION_ARCHITECTURE.md`
- File/Folder配置: `docs/04_REPOSITORY_STRUCTURE.md`
- 設計変更ルール: `docs/05_DESIGN_MANAGEMENT.md`
- Requirement対応: `docs/06_REQUIREMENTS_TRACEABILITY.md`
- Visual Design: `docs/design/`
- 重要な設計判断: `docs/adr/`

同じ仕様を複数設計書へコピーして正本を増やさない。担当外の文書からは設計IDまたはリンクで参照する。

## 作業順序

1. `docs/README.md` と関連設計書、Issueを読む
2. 対象REQ/NFR/ARCH/APP/UI/DATA/IF/ADR、変更範囲、非対象を確認する
3. 仕様変更なら正本設計書を先に更新する
4. Architecture上の重要判断ならADRを更新・追加する
5. Requirement変更ならTraceabilityも更新する
6. 1 Issue専用Branchで実装する。Branch名にIssue番号を含め、Issue → Branch → PR → Mergeを追跡可能にする
7. lint・test・buildを実行する
8. Previewで確認可能な状態にする
9. 人間承認前にmainへマージしない
10. Merge後にProductionと主要回帰を確認する
11. 設計・仕様・運用が変わった場合はNotion最終設計をmainへ同期する。設計変更なしならIssue / PRへ更新不要を記録する

## 必須ルール

- mainを直接変更しない
- 秘密情報、認証情報、個人情報をcommitしない
- ProductionデータへPreviewから書き込まない
- 承認済みAssetを独断で再生成・変更しない
- 外部仕様や現在値を推測で確定しない
- TBDをAI判断で勝手に閉じない
- CI失敗を再実行だけで済ませず、根本原因を分類する
- Closed・Unmergedを自動的に失敗扱いしない
- 破壊的操作、本番公開、重要なMerge、認証は人間判断を残す
- コードが動いていても、必要な設計更新が欠けていれば完了扱いにしない

## AI変更制御

AIによる変更は、調査・契約・変更・検証の境界を分ける。

- **Scope Lock**: 変更前にGoal、In Scope / Out of Scope、Planned Files、Validation、Stop Conditionsを確認し、合意した範囲を固定する
- **Read-only First**: 変更前にmain、Issue、関連設計書、関連test / workflow、外部制約を読み、現状を確認する
- **Pre-flight**: 変更対象・依存関係・Risk Level・実行可能な検証を先に整理する
- **Discovery / Modification separation**: 調査中に見つけた別問題を、そのまま同じ変更へ混ぜない
- **Unexpected File Change Stop**: Planned Files外の変更が必要になったら停止し、理由と影響をHumanへ報告する
- **No Opportunistic Fix**: ついで修正をしない。別問題はIssue候補として分離する
- **Minimum Necessary Diff**: 目的達成に必要な最小差分を優先する
- **Instruction Boundary**: 「続けて」は現在合意済み工程の継続であり、Scope拡張・破壊的操作・Merge・Production releaseの承認ではない
- **Approval Boundary**: Human承認が必要な工程は、明示承認前に越えない。Human GateはDesign判断、実機確認、Binary Upload、重要なMerge、Production/Publicの重要操作、破壊的操作、Risk上昇、Scope拡張などに限定し、単なる工程境界と区別する
- **Evidence Before Claim**: 実行していないCI / Preview / Deploy / smokeを成功・確認済みとして扱わない
- **Risk Level**: Low / Medium / Highを作業前に判定し、Riskに応じて必要なGateと証跡量を変える。Highはrollback・停止条件・Human確認点を明記する
- **Impact Flags**: Runtime / UI / Mobile・Sensor / Asset / Security・Secret・Infra / Public Repository / Design・Operation Meaning をYes/No判定し、Preview・実機・Production・Notion同期等を条件適用する
- **Human Gateまで連続実行**: Change Contractが合意済みなら、AIはRead-only確認 → Branch → 実装 → 適用対象のlint/test/build → PR → CI → 条件付きPreviewまで、次のHuman GateまたはStop Conditionに当たるまで連続して進める。「続けて」を各機械工程の再承認として要求しない
- **Stop報告**: 停止理由、影響範囲、実施済み、未実施、次に必要な確認を分けて記載する

ルールの優先順位は、Security・明示されたHuman承認境界・このRepositoryの必須規約・IssueのChange Contract・通常手順の順とし、利便性のために上位ルールを弱めない。

CI失敗やActions制約の分類は `docs/GIT_WORKFLOW.md` と `docs/TROUBLESHOOTING.md` を正本とする。

## 設計変更

Small Changeは同一Branch内で設計を先に更新してから実装してよい。

Architecture、画面構造、データschema、認証、課金、外部IF等の重要変更は、必要に応じてDesign Issue/PRを先に承認し、Implementation Issueへ承認Design PR/SHA/設計IDを引き継ぐ。

詳細は `docs/05_DESIGN_MANAGEMENT.md` を参照する。

## Pull Request

PR本文にはIssue、変更内容、非対象、変更した設計書/設計ID、テスト、Security、SEO、Preview、人間確認、回復方法を記載する。

Draft解除コネクタの互換性が確認できるまでは通常PRを使用し、レビューゲートでマージを止める。Replacement PRを作る場合は元PR、同一head SHA、承認内容、CI run、Preview runを引き継ぐ。

## 人間・AIのGitHub作業分担

- AIがConnector/APIで実行可能なGitHub操作はAIが担当し、人間へ手作業として押し戻さない
- 人間へ依頼するのは、認証・承認・実機確認・Connectorで扱えないbinary upload等、本当に人間操作が必要な作業に限定する
- 人間へbinary uploadを依頼する前に、AIがrepository、branch、配置path、filename、extensionを確定する
- directory作成、branch作成、code/doc更新、commit、PR等をAIが実行可能なら、人間へ事前作業として要求しない
- 人間操作後はAIがRepository上の結果を再確認してから次工程へ進む

## Asset

画像要件 → 生成 → 人間確認 → Design Preview → 承認head SHA → 本番配置の順に扱う。Chat上の生成物が自動的にRepositoryへ入る前提を置かない。

## Cloudflare

機能開発前にHello WorldをPreviewとProductionへ通す。環境変数、Secrets、Bindings、Analytics、Domain、Rollbackを確認する。Pages／Workersはプロジェクト要件と現行公式仕様で選ぶ。
