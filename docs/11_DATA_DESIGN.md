# Data / DB設計

## 1. 目的
Logical Data Model、Dictionary、State、Lifecycle、Transaction、Concurrencyを管理する。

## 2. Phase 1 Logical Model

```text
Group
 ├─ GroupMember -> Player
 └─ Session
     ├─ ParticipantSegment
     │   └─ Game
     │       ├─ GameResult
     │       └─ GameTag
     ├─ SessionParticipantNote
     └─ ChipResult
```

## 3. Game / GameResult Semantics

`Game` は1半荘の結果単位。局単位ではない。

- 3人三麻: GameResult = 3人分
- 4人回し三麻: GameResult = 4人分
- 4人回しでは局ごとに着席3人・待機1人が入れ替わる
- 局ごとの着席/待機履歴はPhase 1では保存しない
- Gameはその半荘に対応するParticipantSegmentを参照する

開始時総点:
- 3人 = 105,000点
- 4人 = 140,000点

## 4. Phase 1 Persistence Schema

- storage key: `mahjong-score:app-data:v1`
- schemaVersion: `1`
- 1 keyにAppDataSchema全体をJSON保存
- write時は全root schemaをvalidationしてから保存

## 5. Invariants

- ParticipantSegmentは3人または4人
- 同一Segment内Player重複禁止
- GameResultはParticipantSegment人数と一致する3人または4人
- GameResult内Player重複禁止
- GameResultのPlayer集合は対象ParticipantSegmentのPlayer集合と一致する
- ChipResult内Player重複禁止
- Chip合計は0
- negative finalPointsは許可

Score balance、100点端数、同点rankはTBD-001 / TBD-002確定後に実装する。

## 6. Score Calculation Decision Inputs

| Rule | Confirmed / TBD |
| --- | --- |
| starting points | 35,000 / player |
| return basis | 40,000 / player |
| conversion | 1,000 points = 1 score point |
| total starting points | 105,000 (3 players) / 140,000 (4 players) |
| one blank player result | balance calculation方針あり |
| negative points | allowed |
| 100-point remainder | TBD-001 |
| tied rank/top | TBD-002 |

## 7. ID / Time

- stable ID: `crypto.randomUUID()`をBrowser runtime adapterで生成
- timestamp: SystemClockでISO 8601 UTC文字列を生成
- sessionDate: `YYYY-MM-DD`

## 8. Delete Policy

未決。Cascade意味を決めるまでRepository Portへdeleteを提供しない。

## 9. Migration

schema v1のみ対応。v2 migrationは別Issue。未知schemaVersionは自動変換せずerrorとする。
