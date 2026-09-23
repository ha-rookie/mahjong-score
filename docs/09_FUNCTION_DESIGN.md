# 機能設計

## 1. 目的
機能一覧と機能詳細をDesign IDで管理する。

## 2. Function Catalog

| ID | 機能 | Phase | Status |
| --- | --- | --- | --- |
| FUNC-001 | Group / Player管理 | 1 | Active: UI connected |
| FUNC-002 | Session開始・参加者選択 | 1 | Active: UI connected |
| FUNC-003 | 半荘結果入力 | 1 | Domain / persistence active, UI pending |
| FUNC-004 | 参加者変更 | 1 | Planned |
| FUNC-005 | Chip精算 | 1 | Planned |
| FUNC-006 | 成績集計 | 1 | Planned |
| FUNC-007 | Backup export/import | 1 | Application active / UI pending |
| FUNC-008 | 認証・認可 | 2-3 | Deferred |

## 3. FUNC-003 半荘結果入力

3人三麻:
- 半荘結果対象は3人
- 順位順に3人を入力
- 2位/3位のScore Pointを入力
- 1位のScore Pointは自動計算

4人回し三麻:
- 局ごとの着席は3人、待機は1人
- 局単位のローテーションはアプリ管理外
- 半荘結果対象は4人
- 順位順に4人を入力
- 2位/3位/4位のScore Pointを入力
- 1位のScore Pointは自動計算

Score Point:
- Userは最終持点ではなくScore Pointを直接入力
- 符計算は行わず、100点単位は扱わない
- 1point=1,000点として整数Score Pointを入力
- 1位 = -(2位以下の合計)
- Game全体のScore Point合計は0
- 負値を許可

Rank:
- Playerの入力順 = rank
- Score Pointが同じでも入力順を優先
- Score値からrankを再計算しない

## 4. Implementation Acceptance Criteria

- 3人Gameは3人Result、4人回しGameは4人Result
- Result Player集合がParticipantSegmentと一致
- result orderを保持
- 1位Scoreのmanual input不要
- Score Pointを整数として扱う
- 1Game合計0
- duplicate Player拒否
- missing / extra Player拒否
- Unit Testで3人/4人/同Score/負値/整数を確認

## 5. Phase 1 Vertical Slice

```text
Home
 -> Group作成
 -> Member追加
 -> 参加者選択
 -> Session開始
 -> Active Session表示
```

## 6. Processing Flow

```text
Event -> UI validation -> Use Case -> Domain -> Repository -> Persistence -> Result -> UI
```
