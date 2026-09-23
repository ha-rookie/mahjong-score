# Requirements Traceability

## 1. 目的
RequirementがDesign・Implementation・Test・Evidenceまでつながっているかを追跡する。

## 2. Matrix

| Requirement | Summary | Design | Issue/PR | Implementation | Test/Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-001 | Group/Player管理 | APP-003/004, DATA-001..003 | #6 | `src/domain`, repository ports | build/lint; Feature test later | ACTIVE |
| REQ-002 | Sessionは日付と別 | DATA-004 | #6 | `Session.id`, `sessionDate` | build/lint | ACTIVE |
| REQ-003 | 参加者構成履歴 | DATA-005 | #6 | `ParticipantSegment` | validation + later unit | ACTIVE |
| REQ-004 | 3/4人Game結果 | DATA-006/007 | #6 | `Game`, `validateGameResults` | build/lint | ACTIVE |
| REQ-008 | Chip合計0 | DATA-009 | #6 | `validateChipResults` | build/lint; later unit | ACTIVE |
| REQ-010 | GameTag | DATA-008 | #6 | `GameTag` | build/lint | ACTIVE |
| REQ-011 | Memo | DATA-004 | #6 | Session note / participantNotes | build/lint | ACTIVE |
| REQ-012 | Backup schema | DATA-010 | #6 | `AppDataSchema.schemaVersion` | implementation later | PLANNED |
| NFR-004 | Secret非公開 | 07/15/16 | #1/#2/#3 | GitHub Secrets | CI/deploy | ACTIVE |

## 3. Rule

Requirement -> Design ID -> Issue/PR -> Implementation -> Test -> Evidence -> Status の順で追跡する。

Unit test frameworkはIssue #6のOut of Scope。Business calculation実装前に別Issueで導入する。
