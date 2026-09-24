# Requirements Traceability

## 1. 目的
RequirementがDesign・Implementation・Test・Evidenceまでつながっているかを追跡する。

## 2. Matrix

| Requirement | Summary | Design | Issue/PR | Implementation | Test/Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-001 | Group/Player管理 | FUNC-001, SCR-001/002 | #6/#8/#10/#12 | Domain + localStorage + React UI | CI + smartphone evidence | ACTIVE |
| REQ-002 | Session開始/参加者選択 | FUNC-002, SCR-003 | #6/#8/#10/#12 | StartSession + React UI | CI + smartphone evidence | ACTIVE |
| REQ-003 | Session開始時の参加者構成保持 | FUNC-002, DATA-005 | #6/#8/#10/#12 | ParticipantSegment（Phase 1ではSession中固定） | automated tests | ACTIVE |
| REQ-004 | 半荘結果対象3/4人 | FUNC-003, SCR-004, DATA Game semantics | #14/#20/#23 | Domain + persistence + React UI | automated tests + UI review | ACTIVE |
| REQ-005 | Integer Score Point / 1point=1,000点 / 合計0 | FUNC-003, SCR-004, DATA score decisions | #14/#16/#20/#23 | GameResult.scorePoint + score domain + repository + UI | score/domain/repository/use-case tests | ACTIVE |
| REQ-006 | N-1セル直接入力 / 残り1セル自動計算 | FUNC-003, SCR-004, DATA result | #14/#20/#23/#25 | score-sheet Domain helper + direct-entry UI | score/use-case tests + smartphone review | ACTIVE |
| REQ-007 | 負Score Point許可 | FUNC-003, SCR-004, DATA invariant | #14/#20/#27 | integer score validation + ± sign toggle UI | score unit tests + PR CI | ACTIVE |
| REQ-008 | Chip合計0 | FUNC-005, SCR-005, DATA-009 | #6/#10/#27 | validateChipResults + Session settlement UI | domain test + PR CI | ACTIVE |
| REQ-009 | Chip 1枚=5pt / 最終合計 | FUNC-005, SCR-005 | #27 | chip conversion + final total UI | PR CI + Production smartphone review済み | ACTIVE |
| REQ-010 | GameTag | FUNC-003, SCR-004 | #6/#27 | Domain互換は維持、新規/訂正UIは空配列保存 | 実機レビューでPhase 1 UIから除外 | DEFERRED |
| REQ-011 | Session memo | SCR-004 | #6/#27 | Session.note + runtime UI | PR CI + Production review済み | ACTIVE |
| REQ-011-FUTURE | Participant memo | Future auth/authorization | #6/#27 | Domain互換は維持、Phase 1 UIでは非表示 | 本人識別・認可導入時に再検討 | DEFERRED |
| REQ-012 | Backup/Restore | DATA-010, FILE-001 | #6/#8/#10 | Export/Import | integration test / CI + UI実装 + smartphone review | ACTIVE |
| NFR-001 | 卓上スマホUsability | SCR-001..005 | #12/#25/#27 | mobile-first UI + direct score entry + ± sign toggle | Production smartphone review済み | ACTIVE |

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


## 6. Phase 2 Traceability

| Requirement / NFR | Summary | Design | Issue/PR | Implementation | Test/Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Phase 2 Persistence | Worker API / D1 source of truth | ARCH-002, DATA Phase 2 | PR #94/#97/#98/#100/#114 | Worker API + API Repository + D1 normalized schema | PR CI / Preview migration / Production deploy | ACTIVE |
| Phase 2 AuthN | LINE Login / application session | ARCH-005, AUTH design | PR #105/#106/#111/#117/#118/#123 | OAuth2/OIDC callback, D1 login state, signed session cookie | Production LINE Login + CI | ACTIVE |
| Phase 2 AuthZ | System Admin / Group Admin / Member | NFR-010, Security Design | PR #87/#112/#120 | Worker API membership/role enforcement | forbidden/IDOR paths + Production use | ACTIVE |
| Phase 2 Invitation | Player invitation / User linking / unlink | Data / Security invitation design | PR #88/#113/#116/#119/#120 | one-time token hash, invitation redemption, manual linking/unlink | Production flow + CI | ACTIVE |
| NFR-008 | optimistic concurrency | Data Concurrency | #146 / PR #147 | Session/Game version + expectedVersion + 409 stale_update | concurrency cases in Test Design / CI | ACTIVE |
| Multi-device | Active Session refresh / shared D1 | Screen / API | #148 / PR #149, #152 / PR #153 | D1 shared state + manual refresh preserving scroll | smartphone review + CI | ACTIVE |
| Audit / Correlation | auth/authz failure + important operation logging | Security / Observability | #154 / PR #155 | Worker structured JSON audit + CF-Ray/UUID | CI + code review | ACTIVE |
| Security Headers | Production browser response hardening | SEC-001..007 | #156 / PR #157 | public/_headers + post-deploy assertions | main run #36071486621 | ACTIVE |
| Recoverability | D1 point-in-time recovery | Operations / Runbook | #158 / PR #159 | D1 Time Travel + Preview rehearsal script | run #36072191864 | ACTIVE |
| NFR-009 | PWA | NFR Design | #160 / PR #161 | no Phase 2 implementation | Human decision: Phase 3+ | DEFERRED |

## 7. Phase 2 Evidence Rule

Phase 2は、単にcodeがmainへ存在することではなく、PR CI / Preview D1 / Production deploy / smartphone review / recovery rehearsal等のEvidenceと接続して完了判定する。

Phase 2 completion audit: Issue #145。
