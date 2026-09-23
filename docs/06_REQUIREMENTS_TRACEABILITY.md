# Requirements Traceability

## 1. 目的

RequirementがDesign・Implementation・Test・Evidenceまでつながっているかを追跡する。

## 2. Matrix

| Requirement | Summary | Design | Issue/PR | Implementation | Test/Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-001 | Group/Player管理 | APP-004/005, DATA-001..003 | #6/#8/#10 | Domain + localStorage repositories + Create/Add use cases | `storage-and-use-cases.test.ts` / CI | ACTIVE |
| REQ-002 | Sessionは日付と別 | DATA-004 | #6/#8/#10 | Session model + StartSession | `storage-and-use-cases.test.ts` / CI | ACTIVE |
| REQ-003 | 参加者構成履歴 | DATA-005 | #6/#8/#10 | ParticipantSegment + atomic initial segment save | `domain-validation.test.ts`, `storage-and-use-cases.test.ts` / CI | ACTIVE |
| REQ-004 | 3/4人Game結果 | DATA-006/007 | #6/#10 | Domain validation | `domain-validation.test.ts` / CI | ACTIVE |
| REQ-008 | Chip合計0 | DATA-009 | #6/#10 | `validateChipResults` | `domain-validation.test.ts` / CI | ACTIVE |
| REQ-010 | GameTag | DATA-008 | #6 | `GameTag` | TypeScript build | ACTIVE |
| REQ-011 | Memo | DATA-004 | #6 | Session note / participantNotes | TypeScript build | ACTIVE |
| REQ-012 | Backup/Restore | DATA-010, FILE-001 | #6/#8/#10 | AppDataStore + Export/Import use cases | Backup round-trip + invalid-import preservation / CI | ACTIVE |
| NFR-003 | Recoverability | 11/12/16/19/20 | #8/#10 | versioned JSON backup contract | Backup integration test / CI | ACTIVE |
| NFR-004 | Secret非公開 | 07/15/16 | #1/#2/#3 | GitHub Secrets | CI/deploy | ACTIVE |

## 3. Rule

Requirement -> Design ID -> Issue/PR -> Implementation -> Test -> Evidence -> Status の順で追跡する。

## 4. Current Gap

まだ自動化していない領域:
- React Component / UI state
- Browser E2E
- Score計算（未決仕様あり）
- Security dynamic test
- Performance / Accessibility
- Production smoke自動化

未実装領域をTest済み扱いにしない。
