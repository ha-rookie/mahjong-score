# 機能設計

## 1. 目的
機能一覧と機能詳細をDesign IDで管理する。

## 2. Function Catalog

| ID | 機能 | Phase | Status |
| --- | --- | --- | --- |
| FUNC-001 | Group / Player管理 | 1 | Active: UI connected |
| FUNC-002 | Session開始・参加者選択 | 1 | Active: UI connected |
| FUNC-003 | 半荘結果入力 | 1 | Active: UI connected |
| FUNC-004 | 同一Session内の参加者変更 | Future | Deferred |
| FUNC-005 | Chip精算 | 1 | Active: UI connected |
| FUNC-006 | 成績集計 | 1 | Planned |
| FUNC-007 | Backup export/import | 1 | Application active / UI pending |
| FUNC-008 | 認証・認可 | 2-3 | Deferred |
| FUNC-009 | 0半荘Session取り消し | 3 RC | Active |
| FUNC-010 | finalized Session Memo編集 | 3 User Test | Active |

## 3. FUNC-003 半荘結果入力

Score Sheet入力:
- 3人三麻はPlayer固定3列、4人回し三麻はPlayer固定4列
- Game = Score Sheetの1行
- Userは任意のN-1人分の整数Score Pointを直接入力
- 残り1人は合計0になるよう自動計算
- 順位選択・順位並べ替えは行わない
- 1point=1,000点、符計算・100点単位・小数は扱わない
- 負値を許可
- 保存済みGameはPlayer列に対応させて表示し、既存Game data shapeを維持

## 4. Runtime Domain / Persistence

Issue #20で以下を実装する。

- `GameResult = { playerId, scorePoint }`
- `createRankedGameResults` が順位順Player IDと2位以下の整数Score Pointから1位を自動計算
- `validateGameResults` が3/4人、重複、整数、合計0を検証
- `validateGameParticipants` がParticipantSegmentとのPlayer集合一致を検証
- `LocalStorageGameRepository` がSession / Segment整合性を確認して保存
- Score値からrankを再計算せず、`Game.results` 順序をそのまま保持

## 5. Application / UI Connection

Issue #25でProduction実機レビューを反映する。

- Active Session自体をScore Sheetとして表示
- Playerを固定列、Gameを行として表示
- 新規行の任意N-1セルへ入力し、残り1セルを自動計算
- 保存後は同じ表へ行を追加し、小計を更新
- 対局中はGroup / Member追加UIを表示しない
- 保存済みGameは編集・削除できる。編集時もN-1入力/合計0制約を再適用する
- 負数はスマホで`-`を直接入力せず、各入力セルの`±`で符号反転できる
- GameTag UIはPhase 1対象外とする。現行Domain contractの互換性は維持するが、新規/訂正では空配列を保存し、利用方法を再定義するまでUIへ再導入しない
- SessionのChipは任意N-1人を整数入力し残り1人を合計0で自動計算、1枚=5ptで麻雀小計へ加算して合計を表示する
- Session memoはActive Sessionで保存できる。finalized SessionはHistory明細からSession memoだけを編集可能とし、Game / Chip / status / Participant memoは変更しない。participant memoは本人識別・認可がないためPhase 1対象外とし、Domain互換のみ維持する
- Phase 1ではSession途中の参加者変更を行わない。参加者が離脱する場合は現在のSessionをチップ精算して終了・確定し、残った3人または4人で新しいSessionを開始する

## 6. Implementation Acceptance Criteria

- 3人Gameは3人Result、4人回しGameは4人Result
- Result Player集合がParticipantSegmentと一致
- result orderを保持
- 1位Scoreのmanual input不要
- Score Pointを整数として扱う
- 1Game合計0
- duplicate Player拒否
- missing / extra Player拒否
- Unit Testで3人/4人/同Score/負値/整数を確認

## 7. Phase 1 Vertical Slice

```text
Home
 -> Group作成
 -> Member追加
 -> 参加者選択
 -> Session開始
 -> Active Session表示
```

## 8. Processing Flow

```text
Event -> UI validation -> Use Case -> Domain -> Repository -> Persistence -> Result -> UI
```


## Session終了
- Gameが1件以上あるActive Sessionから「Sessionを終了」を実行できる
- Game 0件では終了操作を表示せず、FUNC-009の「Sessionを取り消す」を表示する
- 終了操作後はまずResultsを確認表示し、Sessionは`active`のまま維持する
- Resultsの「修正する」でActive Sessionへ戻り、既存の半荘・チップ・メモ編集を利用する
- Resultsの「終了を確定」でstatusを`finalized`、endedAtを終了時刻に更新する
- 終了後はHomeへ戻り、次の3人/4人Sessionを開始できる
- finalized SessionではGame / Chip / status等の確定結果を再編集しない。Session memoのみFUNC-010としてHistory明細から編集できる


### Session Results
- Session終了成功後、そのSessionをread modelで再取得して結果画面を表示する
- 半荘別Score Point、小計、chip枚数、chip換算（1枚=5pt）、最終合計、順位を表示する
- 同点は同順位。Participant列順は変更しない
- Issue #297として、PlayerごとにSession内の平均スコアと勝率を表示する
- 平均スコアは `Session内のscorePoint合計 ÷ Session内のGame数` とし、chip換算を含めず小数1桁で表示する
- 勝率は `そのGameで最高scorePointになった回数 ÷ Session内のGame数 × 100` とし、小数1桁で表示する。最高scorePointが同点の場合は同点Player全員を1位として数える
- 勝率には `4/6` のように1位回数 / Game数を併記する
- 平均スコア・勝率は既存のSession Results read modelに含まれるGameから導出し、D1へ集計値を保存しない
- Active Sessionの終了前ResultsとHistoryから開いたfinalized Resultsで同じ導出ロジックを使う
- 過去Session一覧は別Issueとする


### Session History
- Homeからcurrent Groupのfinalized Session一覧を開ける
- 選択したSessionは既存Session Results read modelで再表示する
- Game / Chip / status等の確定結果はread-onlyとする
- Session memoは対象GroupのMember / Group Admin / System AdminがHistory明細から編集できる
- Session削除は既存どおりSystem Admin / Group Adminのみとする


### Player Performance Aggregates
- finalized Sessionのみを対象にPlayer別通算成績をread-only集計する
- Session数、半荘数、麻雀pt、chip換算込み最終pt、1位回数を集計する
- 3人/4人Sessionを混在可能とする
- 同点最高ptは双方を1位として数える


### Performance Period Filter
- Player成績集計は期間指定なし=通算、year指定=年間、year+month指定=月間とする
- 期間判定はSession.sessionDateを使い、finalized Sessionのみ対象とする


## FUNC-009 0半荘Session取り消し
- 対象は `active` かつGame 0件のSessionのみ
- Score Sheetでは「Sessionを終了」の代わりに「Sessionを取り消す」を表示する
- 確認Dialogで、Session情報が削除され履歴へ残らないことを明示する
- Application Use CaseでGame 0件を確認し、Worker APIでもactive / Game 0件 / expectedVersionを再検証する
- Group Memberは対象Groupの空Sessionを取り消せる
- 既存の履歴Session削除はSystem Admin / Group Adminのみのままとし、権限境界を混同しない
- 0半荘Sessionのfinalizeは禁止する

## FUNC-010 finalized Session Memo編集
- 対象は `finalized` Sessionの `Session.note` のみ
- Historyから対象SessionのResults明細を開き、現在のmemoを編集して保存できる
- 対象GroupのMember / Group Admin / System Adminに許可する
- 専用のmemo-only APIを使用し、Game / Chip / Participant memo / status / endedAtを変更しない
- `expectedVersion` を必須とし、競合時は409 `stale_update`としてsilent overwriteしない
- stale時は対象Sessionを再取得して最新memo/versionへ更新し、Userに再確認を促す
- memo本文はAudit Logへ出さない
