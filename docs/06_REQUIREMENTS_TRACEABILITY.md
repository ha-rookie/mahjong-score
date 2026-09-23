# Requirements Traceability

## 1. 目的
RequirementがDesign・Implementation・Test・Evidenceまでつながっているかを追跡する。

## 2. Matrix

| Requirement | Summary | Design | Issue/PR | Implementation | Test/Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-001 | Group/Player管理 | APP-004/005, DATA-001..003 | #6/#8 | Domain + localStorage repositories + Create/Add use cases | lint/build; unit later | ACTIVE |
| REQ-002 | Sessionは日付と別 | DATA-004 | #6/#8 | Session model + StartSession | lint/build | ACTIVE |
| REQ-003 | 参加者構成履歴 | DATA-005 | #6/#8 | ParticipantSegment + atomic initial segment save | lint/build; unit later | ACTIVE |
| REQ-004 | 3/4人Game結果 | DATA-006/007 | #6 | Domain validation | unit later | ACTIVE |
| REQ-008 | Chip合計0 | DATA-009 | #6 | `validateChipResults` | unit later | ACTIVE |
| REQ-010 | GameTag | DATA-008 | #6 | `GameTag` | build/lint | ACTIVE |
| REQ-011 | Memo | DATA-004 | #6 | Session note / participantNotes | build/lint | ACTIVE |
| REQ-012 | Backup/Restore | DATA-010, FILE-001 | #6/#8 | AppDataStore + Export/Import use cases | lint/build; integration later | ACTIVE |
| NFR-003 | Recoverability | 11/12/16/19 | #8 | versioned JSON backup contract | integration later | ACTIVE |
| NFR-004 | Secret非公開 | 07/15/16 | #1/#2/#3 | GitHub Secrets | CI/deploy | ACTIVE |

## 3. Rule

Requirement -> Design ID -> Issue/PR -> Implementation -> Test -> Evidence -> Status の順で追跡する。

Issue #8ではTest framework追加を行わないため、runtime behaviorの自動Test Evidenceは後続Issueで補完する。
