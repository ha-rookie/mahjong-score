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
| FUNC-006 | 成績集計 | 1 | Active: D1 aggregate / UI connected |
| FUNC-007 | Backup export/import | 1 | Application active / UI pending |
| FUNC-008 | 認証・認可 | 2-3 | Active |
| FUNC-009 | 0半荘Session取り消し | 3 RC | Active |
| FUNC-010 | finalized Session Memo編集 | 3 User Test | Active |
| FUNC-011 | Player個人成績表 | 3 User Test | Planned: Issue #310 |

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

Issue #299以降、保存時はWorkerがScore Pointから実順位を算出し、D1 `game_results.placement` / `is_last`へ保存する。clientが順位を送信してauthoritativeにすることはしない。

実順位ルール:
- `placement = 自分よりScore Pointが高いPlayer数 + 1`
- 最高Score Pointは必ず1人とし、1位同点は保存時に拒否する
- 下位同点は同順位を許可する（例: `1,2,2` / `1,2,3,3`）
- 最小Score Pointの全Playerを`is_last=1`とし、最下位同点を表現する
- Game訂正時は全Resultの`placement` / `is_last`を再計算して置換する
- legacy `game_results.rank`は入力/固定列順の互換列として残し、実順位には使用しない

## 4. Runtime Domain / Persistence

Runtime Model:

- `GameResult = { playerId, scorePoint, placement?, isLast? }`。D1から読み出した保存済みGameでは`placement` / `isLast`を返し、未保存入力やlegacy local dataでは互換のため省略可能とする
- `validateGameResults` が3/4人、重複、整数、合計0を検証
- `validateGameParticipants` がParticipantSegmentとのPlayer集合一致を検証
- `deriveGameResultPlacements` が保存用の`placement` / `isLast`を算出する
- `LocalStorageGameRepository` は既存Runtime shapeを維持する
- D1 Worker write pathはScore Pointからplacementをserver-sideで算出する

D1の既存`rank`列は`Game.results`のlegacy orderを保持する。Issue #299では意味を変更しない。

## 5. Application / UI Connection

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
- legacy result orderを保持
- Score Pointを整数として扱う
- 1Game合計0
- duplicate Player拒否
- missing / extra Player拒否
- 最高Score Pointは1人だけ
- 3人/4人、下位同点、最下位同点でplacement/isLastが正しく算出される
- Unit Testで3人/4人/下位同点/最下位同点/1位同点拒否/負値/整数を確認

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
- 半荘別Score Point、小計、chip枚数、chip換算、最終合計、順位を表示する
- Participant列順は変更しない
- PlayerごとにSession内の平均スコアと勝率を表示する
- 平均スコアは `Session内のscorePoint合計 ÷ Session内のGame数` とし、chip換算を含めず小数1桁で表示する
- 勝率は `保存済みGameResult.placement = 1 の回数 ÷ Session内のGame数 × 100` とし、小数1桁で表示する
- Session ResultsはScore Point最大値から1位を再推定しない。D1に保存済みの`placement`をread modelの正本として使う
- `GET /api/sessions/:sessionId/games` と `GET /api/games/:gameId` は`placement` / `isLast`を返す
- 勝率には `4/6` のように1位回数 / Game数を併記する
- 平均スコア・勝率は既存のSession Results read modelに含まれるGameから導出し、D1へ集計値を保存しない
- Active Sessionの終了前ResultsとHistoryから開いたfinalized Resultsで同じ導出ロジックを使う

### Session History
- Homeからcurrent Groupのfinalized Session一覧を開ける
- 選択したSessionは既存Session Results read modelで再表示する
- Game / Chip / status等の確定結果はread-onlyとする
- Session memoは対象GroupのMember / Group Admin / System AdminがHistory明細から編集できる
- Session削除は既存どおりSystem Admin / Group Adminのみとする

### Player Performance Aggregates
- finalized Sessionのみを対象にPlayer別通算成績をread-only集計する
- 期間指定なし=通算、year指定=年間、year+month指定=月間
- 3人/4人Sessionを混在可能とする
- ranking/graphの並びは従来どおりchip換算込み`finalPointTotal`降順とする
- Performance cardは次の値を表示する
  - 最終pt: chip換算込み合計
  - 麻雀pt / チップpt内訳
  - 平均: `mahjongPointTotal / gameCount`。chipを含めず小数1桁
  - 半荘勝率: `gameFirstPlaceCount / gameCount × 100`。`placement=1`件数を分子とし、`4/12`のように件数も併記
  - Session勝率: `sessionFirstPlaceCount / sessionCount × 100`。Session最終pt（chip込み）が最大だった回数を分子とし、`1/2`のように件数も併記
- `gameFirstPlaceCount`はD1に保存済みの`game_results.placement=1`をaggregateする
- `sessionFirstPlaceCount`はSession単位のfinalPoint最大値から既存ロジックでaggregateする。Session最終pt同点は双方をSession 1位として数える
- 平均/勝率の率そのものはD1へ保存しない。分子・分母のraw aggregateからUIで算出する
- Performance APIは1回のaggregate queryで返し、Game単位の追加N+1 queryを発生させない
- 5年/10年Local D1 benchmarkで既存Performance read budgetを継続検証する

### Performance Period Filter
- Player成績集計は期間指定なし=通算、year指定=年間、year+month指定=月間とする
- 期間判定はSession.sessionDateを使い、finalized Sessionのみ対象とする
- 平均・半荘勝率・Session勝率も同じ期間filterを適用する

## FUNC-008 認証セッション継続 / 401再ログイン
- application sessionは発行時点から24時間を基本有効期限とする
- `GET /api/auth/me` で有効なsessionを確認した際、残り有効時間が12時間以下ならsigned payloadの`exp`とHttpOnly Cookieの`Max-Age`を同時に24時間へ更新する
- Browserは通常操作のたびにCookieを再発行させず、最後の認証確認から1時間以上経過したprotected API操作の直前だけ`/api/auth/me`を確認する
- 24時間以上操作がなくsessionがexpiredした場合は従来どおり401とする
- protected APIの401はnetwork failureと区別し、「ログインの有効期限が切れました。もう一度ログインしてください。」として扱う
- runtime中の401ではApp本体をunauthenticatedへ初期化せず、再ログインDialogを重ねてScore / Chip / Session memo等のReact stateを保持する
- 再ログインは別WindowでLINE authorizationを開始し、元Windowは`/api/auth/me`で復帰を確認する。成功後はDialogを閉じ、Userが失敗した保存操作を再実行できる
- 初期表示時に既にsessionがexpiredしている場合は、未保存入力が存在しないため従来のlogin gateを使用する
- 明示logoutは従来どおりsessionを破棄し、Appの認証状態をunauthenticatedへ遷移する
- LINE Login / Invitation / logoutの既存flowを変更しない

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

関連Decision: `adr/ADR-0001-game-result-placement.md`

## FUNC-010 確定済み半荘結果の管理者訂正
- 確定済みSessionのGameは通常ユーザーおよびGroup Adminには引き続きread-onlyとする
- System AdminだけがHistoryのSession結果から半荘Score Pointを訂正できる
- 訂正画面は現在値を初期表示し、保存前に確定済みデータ変更の確認を必須とする
- Game削除、Session参加者、開催日、チップ、Sessionメモの変更は本機能の対象外とする
- 保存時は既存Game validation、`expectedVersion`、参加者一致、Score Point合計0を維持する
- `placement` / `is_last` は訂正後Score Pointから再計算して同時更新する
- 成功・拒否・競合・更新失敗は `finalized_game_corrected` のaudit eventで追跡可能にする

## FUNC-011 Player個人成績表
- 現行PerformanceはPlayer間比較のランキング／サマリーとして維持し、詳細指標を追加しない
- PerformanceでPlayerを選択すると別画面のPlayer個票を開く
- 個票は通算 / 年間 / 月間を切り替え、finalized Sessionだけを対象にする
- 総合: 最終pt、麻雀pt、Chip累計枚数、Chip換算pt、半荘数、Session数
- 半荘: 平均pt、平均順位、半荘勝率、ラス率、1〜4位の回数・率
- Session: Session勝率
- 順位分布はドーナツグラフと数値一覧を併記し、色だけに意味を依存させない
- 平均順位・順位分布は保存済み`placement`、ラス率は保存済み`is_last`を正本とする
- Score Pointからread時に順位・ラスを再推定しない
- 下位同点は保存済みcompetition placementをそのまま使用し、最下位同点は`is_last=1`の全Playerをラスとして数える
- Chipは半荘ではなくSession単位。枚数と`chip_count * session.chip_rate`による換算ptを分離する
- 率・平均はD1へ保存せず、aggregateの分子・分母から表示時に算出する
- Player個票専用read APIは1回のaggregate queryを基本とし、Game/Session単位N+1を導入しない
- D1 schema / migrationは変更しない
- 初版では月別推移、Chip推移、直近N半荘、連勝/連続ラス、最高/最低記録を扱わない
