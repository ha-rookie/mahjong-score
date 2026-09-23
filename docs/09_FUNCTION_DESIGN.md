# 機能設計

## 1. 目的
機能一覧と機能詳細をDesign IDで管理する。

## 2. Function Catalog

| ID | 機能 | Actor | Phase | Related Screen | Related Data | Status |
| --- | --- | --- | --- | --- | --- | --- |
| FUNC-001 | Group管理 | User | 1 | TBD | Group / Player | Planned |
| FUNC-002 | Session開始・参加者選択 | User | 1 | TBD | Session / Participant | Planned |
| FUNC-003 | 半荘結果入力 | User | 1 | TBD | Game / GameResult | Planned |
| FUNC-004 | 参加者変更 | User | 1 | TBD | ParticipantSegment | Planned |
| FUNC-005 | Chip精算 | User | 1 | TBD | ChipResult | Planned |
| FUNC-006 | 成績集計 | User | 1 | TBD | Session / Game / ChipResult | Planned |
| FUNC-007 | Backup export/import | User | 1 | TBD | All local data | Planned |
| FUNC-008 | 認証・認可 | User | 2-3 | TBD | User / Permission | Deferred |

## 3. Function Detail Template

| Field | 内容 |
| --- | --- |
| Function ID | FUNC-xxx |
| Purpose | 何を実現するか |
| Actor | 誰が実行するか |
| Preconditions | 前提 |
| Trigger | 操作 / API / Batch |
| Normal Flow | 正常系 |
| Alternate Flow | 代替系 |
| Error Flow | 異常系 |
| Validation | 入力検証 |
| Authorization | 必要Permission / scope |
| Transaction | commit境界 |
| Audit | 記録対象 |
| Messages | MSG-xxx |
| Related Data | DATA-xxx |
| Related Interfaces | IF-xxx |
| NFR | NFR-xxx |

## 4. 処理機能記述

初期表示、登録、訂正、確定、取消等はEvent単位で処理順を記述する。

```text
User Event
 -> UI validation
 -> Use Case
 -> authorization
 -> domain validation
 -> repository
 -> persistence
 -> audit
 -> response
 -> UI update
```

Phase 1ではserver処理がないため、実際の責務へ読み替える。
