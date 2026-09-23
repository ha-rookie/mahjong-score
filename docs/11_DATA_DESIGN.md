# Data / DB設計

## 1. 目的
論理Data Model、物理Table、Data Dictionary、ER、状態遷移、Lifecycle、Transaction、排他を管理する。

## 2. Logical Model

Phase 1:

```text
Group
 ├─ GroupMember -> Player
 └─ Session
     ├─ SessionParticipant
     ├─ ParticipantSegment
     │   ├─ SegmentParticipant
     │   └─ Game
     │       ├─ GameResult
     │       └─ GameTag
     └─ ChipResult
```

論理modelの詳細は機能Issueで段階的に確定する。

## 3. ID

- display name / array indexをprimary keyにしない
- UUID等のstable IDをPhase 1から使う
- D1移行後もIDを維持する

## 4. Data Dictionary Template

| DATA ID | Field | Meaning | Type | Length | Null | Default | Domain/Code | PII | Persistence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DATA-001 | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

## 5. Table List / Definition

Phase 1: N/A（D1なし）

Phase 2で:
- table name
- column
- PK/FK
- unique
- check
- default
- index
- version
- created/updated timestamp
- delete policy

を定義する。SQL生成の根拠はDB定義書とmigrationを一致させる。

## 6. Views

Phase 1: N/A

D1 Viewを採用する場合、View ID、source table、join/filter、用途、performance影響を管理する。

## 7. ER Diagram

Phase 2で物理Table確定時に追加する。論理Entityと物理Tableを区別する。

## 8. State Transition

対象例: Session

```text
DRAFT
 -> ACTIVE
 -> FINALIZED
```

訂正 / 再open / cancelはTBD。禁止遷移も明示する。

## 9. Transaction

Phase 1:
- localStorage write単位をRepositoryで制御
- importは全体validation成功後のみ反映

Phase 2:
- 1 business operation = 1 atomic boundaryを原則に検討
- external IFをまたぐ場合はpartial failureを設計する

## 10. Concurrency

Phase 1: single-browser前提でserver-side排他なし。

Phase 2:
- optimistic locking / version
- update conflict message
- retry可否
- stale update rejection

## 11. Data Lifecycle

各Entityについて以下を決める。
- create
- update
- finalize
- correction
- delete
- retention
- archive
- backup
- restore

実在メンバーのSample DataをPublic Repositoryへcommitしない。
