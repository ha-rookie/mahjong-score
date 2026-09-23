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

## 3. Phase 1 Persistence Schema

- storage key: `mahjong-score:app-data:v1`
- schemaVersion: `1`
- 1 keyにAppDataSchema全体をJSON保存
- write時は全root schemaをvalidationしてから保存

Root fields:
- schemaVersion
- groups
- players
- groupMembers
- sessions
- participantSegments
- games

## 4. Atomic Operation

Phase 1のcompound updateは、1回のAppDataSchema replaceで保存する。

- Player + GroupMember
- Session + initial ParticipantSegment

これにより途中成功によるorphan dataを避ける。

## 5. Invariants

- ParticipantSegmentは3人または4人
- 同一Segment内Player重複禁止
- GameResultは3人または4人分
- GameResult内Player重複禁止
- ChipResult内Player重複禁止
- Chip合計は0
- negative finalPointsは許可

Score balance、100点端数、同点rank等は未決のため未実装。

## 6. ID / Time

- stable ID: `crypto.randomUUID()`をBrowser runtime adapterで生成
- timestamp: SystemClockでISO 8601 UTC文字列を生成
- sessionDate: `YYYY-MM-DD`

## 7. Delete Policy

未決。Cascade意味を決めるまでRepository Portへdeleteを提供しない。

## 8. Migration

schema v1のみ対応。v2 migrationは別Issue。未知schemaVersionは自動変換せずerrorとする。

## 9. Phase 2

D1移行時は同じstable IDを維持し、物理Table/ER、transaction、optimistic lockingを追加する。
