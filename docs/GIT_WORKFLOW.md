# Git Workflow

## 原則

1 Issue・1 Branch・1 Pull Requestを基本とし、mainは直接変更しない。

Issueは「何を変えるか」を定義するChange Contract、Branchは「その変更が現在どこまで実装されているか」を示す作業状態として1セットで扱う。Open Issueだけを見て未着手・未実装と判断しない。

## Branch命名

- `feat/issue-<number>-<summary>`
- `fix/issue-<number>-<summary>`
- `design/issue-<number>-<summary>`
- `docs/issue-<number>-<summary>`

## Change Contract / Pre-flight

変更前にIssueで次を確定する。

- Goal
- In Scope / Out of Scope
- Planned Files
- Risk Level
- Impact Flags
- Validation
- Stop Conditions

AIは最初にRead-onlyでmain、Issue、関連設計書、関連test / workflowを確認する。Planned Files外の変更、Scope拡張、別問題の修正が必要になった場合は、その場で変更を広げず停止してHumanへ報告する。

調査と変更を分け、ついで修正を避け、目的達成に必要な最小差分を優先する。

## Risk / Impact Execution Profile

既存の `Risk Level: Low / Medium / High` を、単なる記録ではなく実行プロファイルとして使う。別のLite / Standard / Strict分類は増やさない。

### Impact Flags

Change Contractでは次をYes / Noで判定する。

- Runtime
- UI
- Mobile / Sensor
- Asset
- Security / Secret / Infra
- Public Repository
- Design / Operation Meaning

Riskは変更の危険度、Impact Flagsは必要な確認面を表す。RiskだけでPreviewやProduction確認の有無を決めない。

### Low

主な対象はdocs、README、文言、小さなCSS、非Runtime整理、既存仕様を変えない軽微修正。

必須はGoal / Scope / Planned Files / Risk / Impact Flags / Validation / Stop Conditions / Branch / PR / Human Merge approval。ImpactがなければDesign Preview、実機、Production Verification、ADR、Notion同期、外部Security診断を要求しない。

Human介入は原則として最終Review / Merge判断の1回を目標とする。Stop Conditionに入った場合のみ追加確認する。

### Medium

通常Feature、UI変更、API接続、PWA、Local Storage等。Impact Flagsに応じてPreview、実機、Production Verification、Notion同期等を適用する。

Human介入は原則1〜2回とし、必要なUI / 実機Reviewと最終Merge判断へ集中させる。

### High

Security、Auth、Secrets、Data migration、Production infra、Public / Private変更、Ruleset、課金、大きなArchitecture変更、破壊的操作等。Full Gateを維持し、軽量化対象にしない。

### Human Gateまで連続実行

Change Contractが合意済みなら、AIは次のHuman GateまたはStop Conditionまで連続して進める。

1. Read-only確認
2. Issue専用Branch
3. 実装
4. 適用対象のlint / test / build
5. PR作成
6. CI確認
7. Impactに応じたPreview準備・確認

途中でHumanへ戻すのは、Planned Files外変更、Scope拡張、Risk上昇、material Design decision、画像生成、Binary Upload、実機Human Review、Merge、Production / Publicの重要操作、Connector / Tool limitation等。

GR-004「Continue is scoped」は維持する。承認境界を減らすのではなく、**承認境界と単なる工程境界を分ける**。

### 1 Issue = 1 coherent goal

「1 Issue = 1変更」は、ファイル単位・微修正単位ではなく、1つのまとまった目的を基本とする。

同じHuman Review、同じ画面・機能領域、同じRisk、同じValidationで確認でき、Architecture / Security / Dataへ波及しない軽微修正は1つのReview Fix Issueへまとめてよい。

Scopeが別機能へ広がる、Riskが変わる、別のHuman decisionが必要、Architecture / Security / Dataへ波及する場合は別Issueへ分離する。

## 作業復帰 / Recognition Mismatch Guardrail

新しいChatGPTチャット、長時間中断、コンテキスト喪失後は会話記憶から復帰しない。原則として次を確認する。

1. Notionの対象プロジェクト最終設計・現在地
2. Open Issue / Change Contract
3. Issue番号を含む対応BranchとPR
4. mainとの差分とMerge状態
5. データ処理・分析では必要なGoogle Drive作業データ
6. 原典そのものの確認が必要な場合のみBox

Branch名にはIssue番号を含め、Issue → Branch → PR → Merge commitを追跡可能にする。

Humanから「前にやった」「認識が違う」「それではない」「もう実装したはず」等の指摘があった場合、AIはIssue本文や会話記憶だけで推測を続けない。Issue → Branch / PR → main → 必要な作業データをRead-onlyで確認し、管理情報と実装事実の差分を特定してから再開する。

## 情報層

- **Box**: 普遍的な原典・生データ。加工・意味付けしないRaw / Immutable層
- **Google Drive**: 作業・加工・集計・比較等のWorking層
- **GitHub**: 開発作業場。Issue / Branch / PR / Actions / test / sourceを保持し、mainを確定実装の現在値とする
- **Notion**: mainに対応する最終設計、意味付けされた成果、判断、現在地、再利用知識

同じ情報を全層へ複製しない。必要な参照先へ辿れる状態を優先する。

## PR作成前

- Issueの受け入れ条件を確認
- 最新mainを取り込む
- Risk / Impactに応じて必要なlint・test・buildを実行
- 設計書、Security、SEO、データ、運用影響を確認
- UI / Runtime等のImpactがある場合だけ必要なPreview確認方法を用意

## Review Gate

通常PRを第一候補とする。Risk / Impactに応じて必要なCI、Preview、スマホ実機を実施し、人間承認と承認head SHAを記録してからMergeする。非該当のGateを形式的に要求しない。

## GitHub Actions 実行資源

CIは品質ゲートであると同時に、月次利用枠を消費する有限の実行資源として扱う。

### 実行前

- 同じ変更で `push` と `pull_request` が不要に二重起動しないか確認する
- 可能ならlint・test・buildをローカルまたは単一Jobで先に確認する
- 小さな修正を細切れcommitしすぎて同じCIを何度も起動しない
- scheduled workflowは必要な頻度か定期的に見直す
- 使われていない旧Workflowや重複Workflowを残さない
- Jobには用途に応じた `timeout-minutes` を設定し、無制限に近い長時間実行を避ける

### 失敗時

- 同一原因を修正しないまま連続rerunしない
- annotation・最初の根本エラー・Job logsを確認して原因仮説を立てる
- 一部Jobだけ失敗しており再実行可能な場合は、全Workflowではなくfailed jobだけのrerunを優先する
- 外部設定・Secrets・Bindings・権限起因の場合、コードを変えずに再実行すべきかを先に判断する
- 同じ失敗を繰り返す場合はrerunを止め、Issue/原因切り分けへ戻る

### 利用枠が逼迫した場合

- 80%到達時: 不要な定期実行、重複trigger、旧Workflow、長時間Jobを点検する
- 90%到達時: 必須CIとリリース関連を優先し、任意検証や頻繁な手動実行を抑える
- 残量とリセット日を確認し、期限のあるProduction Releaseに必要な実行枠を残す
- 品質ゲート自体は外さず、実行回数・対象・順序を最適化する

### CI失敗分類

CI失敗は次のどれかに分類してから対応する。

- **A: 今回の変更** — 現在の差分が直接原因
- **B: 古いtest / validation** — 現仕様とtest・検証条件がずれている
- **C: 環境・外部制約** — Actions quota、billing、権限、外部サービス、runner等
- **D: 既存問題** — 今回の差分以前から存在する問題
- **E: 未確定** — 証拠不足でまだ分類できない

分類前に、RepositoryがPublic / Privateのどちらか、runnerがstandard GitHub-hosted / larger / self-hostedのどれか、Workflow trigger、Jobが実際に開始したかを確認する。

Actions上限や外部制約だけを理由にGitHub作業全体を停止しない。設計、コード、文書、静的レビューなど制約に依存しない作業は継続できる。ただし依存するCI / Preview / Deployは **未検証** と記録し、必要なReview Gate / Merge Gateで停止する。

### 実装状態の表現

- **Implemented**: 変更は作成済み
- **CI Validated**: 必須CIが実行され成功
- **Blocked**: 外部制約または未解決問題で次Gateへ進めない
- **Production Verified**: Merge後のProduction確認まで完了

これらを混同しない。

## Public Repository Gate / Ruleset

RepositoryをPrivateからPublicへ変更する場合、visibility変更だけで完了としない。

GitHub Templateから作成したRepositoryには、Template RepositoryのSettings / Rulesetは引き継がれない。したがって、Public化するRepositoryごとにRulesetを作成する。

### Public化前

- `.github/workflows/fork-monitor.yml` がdefault branchへ反映済み
- RepositoryのIssuesが有効
- Secret、token、credential、個人情報、非公開資料、公開禁止Assetが履歴を含めて存在しないことを確認する

### Public化直後

Repository Settings → Rules → Rulesets でbranch ruleset `main protection` をHumanが作成する。

Ruleset作成は **Human operation** とする。管理権限を持つPAT / GitHub App / WorkflowへAdministration write権限を渡して自動作成しない。AIはGitHub UIでの設定手順案内と、作成後のRead-only API確認を担当する。

必須設定:

- Enforcement: `Active`
- Target: Default branch
- Bypass: なし
- Restrict deletions: ON
- Require a pull request before merging: ON
- Required approvals: 0
- Require conversation resolution before merging: ON
- Allowed merge methods: Merge / Squash
- Block force pushes: ON

PR用CIが存在するRepositoryでは追加で:

- Require status checks to pass: ON
- Required checksはRepository固有の実在checkを登録する
- 対象PRで常に生成されるcheckだけをRequiredにする
- Require branches to be up to date before merging: ON

Template Repository自身をPublic化する場合も同じRulesetを作成する。

### 完了確認

画面設定だけで完了扱いにしない。GitHub API等のRead-only確認で次を実測する。

- visibility = `public`
- default branch上にFork monitorが存在
- Ruleset `main protection` が存在
- enforcement = `active`
- default branch対象
- deletion禁止
- PR必須
- conversation resolution必須
- allowed merge methodsが意図どおり
- force push禁止
- bypassなし
- Required status checks採用時はcheck名とup-to-date設定が意図どおり

全項目確認後に **Public Repository Gate = Passed** と記録する。

## Branch保護が強制できない場合

GitHub画面でRulesetが強制されないと表示される場合、設定済みと扱わない。

private個人開発では、次を代替ゲートとする。

- AIはmainを直接変更しない
- 変更ごとにIssue、専用Branch、PRを作る
- CI成功後に人間が内容を確認する
- 承認対象のhead SHAを確認してからMergeする
- Mergeは明示的な人間承認後だけ行う
- Force pushとBranch削除を行わない

強制的なBranch保護が必要な場合は、repositoryのPublic化または対応するGitHubプラン・organizationへの移行を人間が判断する。

## Draft解除に失敗した場合

Git競合と決めつけない。CI、mergeable、Draft状態、解除API、base、保護ルール、権限を分けて確認する。

同一head SHAから非Draft PRを作り、元PR番号、承認head SHA、CI run、Preview run、レビュー結果を引き継ぐ。

## Merge後

main CI、Production Deploy、本番表示、主要回帰を確認する。

設計・仕様・運用が変わった場合は、mainの確定実装に合わせてNotionの最終設計書を同期する。設計変更を伴わない修正はNotionを無理に更新せず、Issue / PRへ「Notion更新不要」と記録する。

Issue Closeは、必要なValidation・Human Review・Merge・Production Verified・Notion同期（または更新不要確認）が完了してから行う。
