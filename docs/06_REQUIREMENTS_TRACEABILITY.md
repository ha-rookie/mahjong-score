# Requirements Traceability

## 1. 目的
RequirementがDesign・Implementation・Test・Evidenceまでつながっているかを追跡する。

## 2. Matrix

| Requirement | Summary | Design | Issue/PR | Implementation | Test/Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-001 | Group/Player管理 | FUNC-001, SCR-001/002 | #6/#8/#10/#12 | Domain + localStorage + React UI | CI + smartphone evidence | ACTIVE |
| REQ-002 | Session開始/参加者選択 | FUNC-002, SCR-003 | #6/#8/#10/#12 | StartSession + React UI | CI + smartphone evidence | ACTIVE |
| REQ-003 | 参加者構成履歴 | FUNC-002, DATA-005 | #6/#8/#10/#12 | ParticipantSegment | automated tests | ACTIVE |
| REQ-004 | 半荘結果対象3/4人 | FUNC-003, DATA Game semantics | #14 | Human-confirmed design | design review | ACTIVE |
| REQ-005 | Integer Score Point / 1point=1,000点 / 合計0 | FUNC-003, DATA score decisions | #14/#16/#20 | GameResult.scorePoint + score domain + repository | score/domain/repository tests | ACTIVE |
| REQ-006 | input order rank / first place auto score | FUNC-003, DATA result order | #14/#20 | createRankedGameResults + Game.results order | score unit tests | ACTIVE |
| REQ-007 | 負Score Point許可 | FUNC-003, DATA invariant | #14/#20 | integer score validation | score unit tests | ACTIVE |
| REQ-008 | Chip合計0 | DATA-009 | #6/#10 | validateChipResults | domain test / CI | ACTIVE |
| REQ-012 | Backup/Restore | DATA-010, FILE-001 | #6/#8/#10 | Export/Import | integration test / CI | ACTIVE |
| NFR-001 | 卓上スマホUsability | SCR-001..003 | #12 | mobile-first UI | Production smartphone screenshots | ACTIVE |

## 3. Score Implementation Gate

Human decisions completed:
- TBD-001 Resolved: UserはScore Pointを直接入力。符計算なし、100点単位なし、1point=1,000点の整数入力
- TBD-002 Resolved: Player入力順を順位として扱い、同じScore Pointでも順序を維持
- 4人回し三麻は半荘結果4人分

FUNC-003のScore Domain / Game persistenceはIssue #20で実装。React半荘結果入力UIは次Issue。

## 4. Model Gap Resolution

Issue #20で`GameResult.finalPoints/mahjongScore`を`scorePoint`へ置換し、strict schema validatorとLocalStorageGameRepositoryを同じ契約へ整合する。Production UIにはIssue #20以前Game作成経路がないため、schemaVersion 1を維持する。

## 5. Rule

Requirement -> Design ID -> Issue/PR -> Implementation -> Test -> Evidence -> Status の順で追跡する。
