# Requirements Traceability

## 1. 目的
RequirementがDesign・Implementation・Test・Evidenceまでつながっているかを追跡する。

## 2. Matrix

| Requirement | Summary | Design | Issue/PR | Implementation | Test/Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-001 | Group/Player管理 | FUNC-001, SCR-001/002 | #6/#8/#10/#12 | Domain + localStorage + React UI | CI + smartphone evidence | ACTIVE |
| REQ-002 | Session開始/参加者選択 | FUNC-002, SCR-003 | #6/#8/#10/#12 | StartSession + React UI | CI + smartphone evidence | ACTIVE |
| REQ-003 | 参加者構成履歴 | FUNC-002, DATA-005 | #6/#8/#10/#12 | ParticipantSegment | automated tests | ACTIVE |
| REQ-004 | 半荘結果対象3/4人 | FUNC-003, SCR-004, DATA Game semantics | #14/#20/#23 | Domain + persistence + React UI | automated tests + UI review | ACTIVE |
| REQ-005 | Integer Score Point / 1point=1,000点 / 合計0 | FUNC-003, SCR-004, DATA score decisions | #14/#16/#20/#23 | GameResult.scorePoint + score domain + repository + UI | score/domain/repository/use-case tests | ACTIVE |
| REQ-006 | N-1セル直接入力 / 残り1セル自動計算 | FUNC-003, SCR-004, DATA result | #14/#20/#23/#25 | score-sheet Domain helper + direct-entry UI | score/use-case tests + smartphone review | ACTIVE |
| REQ-007 | 負Score Point許可 | FUNC-003, SCR-004, DATA invariant | #14/#20/#27 | integer score validation + ± sign toggle UI | score unit tests + PR CI | ACTIVE |
| REQ-008 | Chip合計0 | FUNC-005, SCR-005, DATA-009 | #6/#10/#27 | validateChipResults + Session settlement UI | domain test + PR CI | ACTIVE |
| REQ-009 | Chip 1枚=5pt / 最終合計 | FUNC-005, SCR-005 | #27 | chip conversion + final total UI | PR CI + Production review pending | ACTIVE |
| REQ-010 | GameTag | FUNC-003, SCR-004 | #6/#27 | Domain互換は維持、新規/訂正UIは空配列保存 | 実機レビューでPhase 1 UIから除外 | DEFERRED |
| REQ-011 | Session memo | SCR-004 | #6/#27 | Session.note + runtime UI | PR CI + Production review済み | ACTIVE |
| REQ-011-FUTURE | Participant memo | Future auth/authorization | #6/#27 | Domain互換は維持、Phase 1 UIでは非表示 | 本人識別・認可導入時に再検討 | DEFERRED |
| REQ-012 | Backup/Restore | DATA-010, FILE-001 | #6/#8/#10 | Export/Import | integration test / CI | ACTIVE |
| NFR-001 | 卓上スマホUsability | SCR-001..005 | #12/#25/#27 | mobile-first UI + direct score entry + ± sign toggle | Production smartphone review; 4-player review pending | ACTIVE |

## 3. Score Implementation Gate

Human decisions completed:
- TBD-001 Resolved: UserはScore Pointを直接入力。符計算なし、100点単位なし、1point=1,000点の整数入力
- TBD-002 Superseded by Issue #25 Production review: UIでは順位を入力せず、Player固定列の任意N-1セルへScore Pointを直接入力
- 4人回し三麻は半荘結果4人分

FUNC-003のScore Domain / Game persistenceはIssue #20、初回React UIはIssue #23。Production実機レビューを受けIssue #25で紙の得点記録表型の直接入力UIへ再設計する。

## 4. Model Gap Resolution

Issue #20で`GameResult.finalPoints/mahjongScore`を`scorePoint`へ置換し、strict schema validatorとLocalStorageGameRepositoryを同じ契約へ整合する。Production UIにはIssue #20以前Game作成経路がないため、schemaVersion 1を維持する。

## 5. Rule

Requirement -> Design ID -> Issue/PR -> Implementation -> Test -> Evidence -> Status の順で追跡する。
