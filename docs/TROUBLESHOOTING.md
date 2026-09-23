# Troubleshooting

## 記録項目

事象、影響、工程、再現条件、原因、確認順、暫定回避、恒久対策、復旧、Issue・PR・CI run、証跡、標準への反映先。

## Draft PRを解除できない

Draft解除APIを疑う。CIとmergeableが正常なら、同一head SHAから通常PRを作り、レビュー証跡を引き継ぐ。

## CI失敗

### 確認順

1. Workflow / Job / Stepを特定する
2. annotationと最初の根本エラーを確認する
3. lint、test、build、静的データを切り分ける
4. 外部設定、Secrets、Bindings、権限を確認する
5. 同じ原因で既に失敗していないか直近runを確認する

### rerun判断

- 原因を修正せず同一runを連続rerunしない
- 一部Jobだけ失敗した場合、可能ならfailed jobだけを再実行する
- 一時的な外部障害や権限設定修正など、コード差分不要と判断できる場合のみrerunを使う
- 同じエラーが再現したらrerunを止め、Issue/修正Branchへ戻る
- `push` と `pull_request` の二重起動が原因で同等CIが重複していないか確認する

### 利用量

GitHub Actionsの利用量が80%・90%へ近づいた場合は、不要なscheduled workflow、重複trigger、旧Workflow、過度に長いtimeoutを点検する。品質確認を省略するのではなく、必須CI・Release関連へ実行枠を優先する。

### 原因分類

CI失敗は、修正やrerunの前に分類する。

| 分類 | 内容 | 初動 |
| --- | --- | --- |
| A | 今回の変更が原因 | 差分を修正 |
| B | 古いtest / validation | 現仕様とtestのどちらが正本か確認 |
| C | 環境・外部制約 | quota、billing、権限、runner、外部サービスを確認 |
| D | 既存問題 | 今回Scopeから分離し、影響を記録 |
| E | 未確定 | 追加証拠を集め、推測で修正しない |

### Actionsが起動しない・開始前に失敗する

1. RepositoryがPublic / Privateか確認する
2. runner種別を確認する
3. Workflow triggerが今回のeventを対象にしているか確認する
4. Workflow run / Jobが実際に開始したか確認する
5. quota / billing / permission / GitHub側障害を確認する
6. JobのStepが開始していない場合、コード失敗と断定しない
7. 外部制約なら分類Cとし、依存しない作業だけ継続する
8. CIは未検証として残し、制限解除後の再検証対象へ入れる

rerunは、設定変更、一時障害の解消、利用枠回復など**結果が変わる根拠がある場合のみ**行う。

## Preview Deploy失敗

BuildとDeployを分ける。出力先、変数、Secrets、Bindings、Cloudflare側機能、Production依存を確認する。

## AI画像をRepositoryへ渡せない

採用画像を人間がファイルとして確定し、所定場所へ配置する。プロンプトと仕様も保存し、commit後にCIとPreviewを行う。

## privateリポジトリでRulesetが強制されない

### 事象

個人アカウントのprivate repositoryでBranch Ruleset作成画面に、GitHub Team organization accountへ移さない限りRulesetは強制されない旨が表示される。

### 影響

Rulesetを保存してもmain保護が実効化されず、設定済みという誤認を招く。

### 確認

GitHubのプラン、repositoryのvisibility、所有者が個人かorganizationか、Ruleset画面のenforcement警告を確認する。画面やプランは変更され得るため、アプリ作成時に現在の表示を一次情報として確認する。

### 回避策

- 実効性のないRulesetは作成しない
- privateを維持する場合は、1 Issue・1 Branch・1 PR、CI成功、人間承認、承認head SHAを運用ゲートとする
- 強制保護が必要なら、Public化または対応プラン・organizationへの移行を別途判断する
- mainへの直接変更をAIへ許可しない
- 制約と判断をIssue・PR・証跡へ残す

## Closed・Unmerged

技術失敗、Draft引き継ぎ、不採用、重複、実験終了を分類する。

## 知識の昇格

Known Issue → 手順 → テンプレート → CIの順に、同じ失敗を考えなくても済む仕組みへ変える。
