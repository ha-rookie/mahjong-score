# 機能設計

## 1. 目的
機能一覧と機能詳細をDesign IDで管理する。

## 2. Function Catalog

| ID | 機能 | Phase | Status |
| --- | --- | --- | --- |
| FUNC-001 | Group / Player管理 | 1 | Active: UI connected |
| FUNC-002 | Session開始・参加者選択 | 1 | Active: UI connected |
| FUNC-003 | 半荘結果入力 | 1 | Active: UI connected |
| FUNC-004 | 参加者変更 | 1 | Planned |
| FUNC-005 | Chip精算 | 1 | Active: UI connected |
| FUNC-006 | 成績集計 | 1 | Planned |
| FUNC-007 | Backup export/import | 1 | Application active / UI pending |
| FUNC-008 | 認証・認可 | 2-3 | Deferred |

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
- GameTagは現行Domain contractの役満 / ダブル役満を対象Player付きで登録できる
- SessionのChipは任意N-1人を整数入力し残り1人を合計0で自動計算、1枚=5ptで麻雀小計へ加算して合計を表示する
- Session memo / participant memoを保存できる
- Session終了 / 参加者変更は別Feature

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
