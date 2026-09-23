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

## 3. Model Contracts

| DATA ID | Model | Key fields |
| --- | --- | --- |
| DATA-001 | Group | id, name, createdAt, updatedAt |
| DATA-002 | Player | id, displayName, createdAt, updatedAt |
| DATA-003 | GroupMember | groupId, playerId, active |
| DATA-004 | Session | id, groupId, sessionDate, startedAt, endedAt, status, memo, chipResults |
| DATA-005 | ParticipantSegment | id, sessionId, sequence, participantPlayerIds |
| DATA-006 | Game | id, sessionId, segmentId, sequence, playedAt, results, tags |
| DATA-007 | GameResult | playerId, finalPoints, mahjongScore |
| DATA-008 | GameTag | type, optional playerId |
| DATA-009 | ChipResult | playerId, chipCount |
| DATA-010 | AppDataSchema | schemaVersion + collections |

## 4. Invariants

- ParticipantSegmentは3人または4人
- 同一Segment内Player重複禁止
- GameResultは3人または4人分
- GameResult内Player重複禁止
- ChipResult内Player重複禁止
- Chip合計は0
- negative finalPointsは許可する

Score balance、100点端数、同点rank等の未決仕様はこのIssueで実装しない。

## 5. Stable ID / Schema Version

- display name / array indexをidentityにしない
- IDはstringのstable identifier
- localStorage BackupはschemaVersionを持つ
- D1移行時もIDを維持する

## 6. Session State

Phase 1 contract: `active | finalized`。cancel/reopen/correctionはTBD。

## 7. Table / View / ER

Phase 1: D1なしのため物理Table/ViewはN/A。Phase 2でLogical Modelから物理schemaとERを確定する。

## 8. Transaction / Concurrency

Phase 1: Repository write単位で整合性を守る。Backup importは全validation成功後に反映する。

Phase 2: optimistic locking / version、transaction、stale update rejectionを設計する。

## 9. Data Lifecycle

create / update / finalize / correction / delete / retention / backup / restoreをEntityごとに後続Issueで具体化する。
