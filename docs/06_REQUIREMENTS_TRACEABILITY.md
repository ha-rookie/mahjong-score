# Requirements Traceability

## 1. 目的

RequirementがDesign・Implementation・Test・Evidenceまでつながっているかを追跡する。

## 2. Matrix

| Requirement | Summary | Design | Issue/PR | Implementation | Test/Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-001 | Group/Player管理 | APP-004/005, FUNC-001, SCR-001/002, DATA-001..003 | #6/#8/#10/#12 | Domain + localStorage + Create/Add/Read use cases + React UI | read/use-case test + CI + UI review | ACTIVE |
| REQ-002 | Sessionは日付と別 | FUNC-002, SCR-003, DATA-004 | #6/#8/#10/#12 | Session model + StartSession + React UI | use-case test + CI + UI review | ACTIVE |
| REQ-003 | 参加者構成履歴 | FUNC-002, SCR-003, DATA-005 | #6/#8/#10/#12 | ParticipantSegment + atomic initial segment + active read model | domain/read tests + CI | ACTIVE |
| REQ-004 | 3/4人Game結果 | DATA-006/007 | #6/#10 | Domain validation | domain test / CI | ACTIVE |
| REQ-008 | Chip合計0 | DATA-009 | #6/#10 | `validateChipResults` | domain test / CI | ACTIVE |
| REQ-010 | GameTag | DATA-008 | #6 | `GameTag` | TypeScript build | ACTIVE |
| REQ-011 | Memo | DATA-004 | #6 | Session note / participantNotes | TypeScript build | ACTIVE |
| REQ-012 | Backup/Restore | DATA-010, FILE-001 | #6/#8/#10 | AppDataStore + Export/Import use cases | Backup integration test / CI | ACTIVE |
| NFR-001 | 卓上スマホUsability | SCR-001..003, 16/20 | #12 | mobile-first React UI | 320px review pending / PR review | ACTIVE |
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
