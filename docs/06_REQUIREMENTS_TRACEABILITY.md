# Requirements Traceability

## 1. 目的
RequirementがDesign・Implementation・Test・Evidenceまでつながっているかを追跡する。

## 2. Matrix

| Requirement | Summary | Design | Issue/PR | Implementation | Test/Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-001 | Group/Player管理 | FUNC-001, SCR-001/002, DATA-001..003 | #6/#8/#10/#12 | Domain + localStorage + React UI | CI + smartphone evidence | ACTIVE |
| REQ-002 | Session開始/参加者選択 | FUNC-002, SCR-003 | #6/#8/#10/#12 | StartSession + React UI | CI + smartphone evidence | ACTIVE |
| REQ-003 | 参加者構成履歴 | FUNC-002, DATA-005 | #6/#8/#10/#12 | ParticipantSegment | automated tests | ACTIVE |
| REQ-004 | 半荘結果対象3/4人 | FUNC-003, DATA Game semantics | #14 | Human-confirmed design clarification | design review | ACTIVE |
| REQ-005 | 35,000持ち/40,000基準/1000=1pt | FUNC-003, DATA score decision | #14 | pending | TBD-001 decision + tests | PLANNED |
| REQ-006 | 1人分balance計算 | FUNC-003, DATA score decision | #14 | pending | score tests | PLANNED |
| REQ-007 | 箱下許可 | FUNC-003, DATA invariant | #14 | pending | score tests | PLANNED |
| REQ-008 | Chip合計0 | DATA-009 | #6/#10 | validateChipResults | domain test / CI | ACTIVE |
| REQ-012 | Backup/Restore | DATA-010, FILE-001 | #6/#8/#10 | Export/Import | integration test / CI | ACTIVE |
| NFR-001 | 卓上スマホUsability | SCR-001..003 | #12 | mobile-first UI | Production smartphone screenshots | ACTIVE |

## 3. Score Implementation Gate

FUNC-003のDomain実装へ進む前にHumanが以下を確定する。

- TBD-001: 100点単位の端数処理
- TBD-002: 同点Top / rank処理

4人回し三麻が半荘結果4人分であることはHuman確認済みで、TBDではない。

## 4. Rule

Requirement -> Design ID -> Issue/PR -> Implementation -> Test -> Evidence -> Status の順で追跡する。
