# Requirements Traceability

## 1. 目的
RequirementがDesign・Implementation・Test・Production Evidenceまでつながっているかを追跡する。

## 2. Status

- ACTIVE
- REPLACED
- DEFERRED
- REMOVED
- TBD
- N/A

ACTIVEをDEFERRED/REMOVEDへ変える場合は理由をIssue/PRへ残す。

## 3. Traceability Matrix

| Requirement | Summary | Design IDs | Issue/PR | Implementation | Test | Evidence | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NFR-001 | 卓上スマホ入力のUsability | 10, 16, 20 | TBD | TBD | 実機UI review | TBD | 1 | ACTIVE |
| NFR-002 | Score/ChipのData Integrity | 09, 11, 16, 20 | TBD | TBD | Unit/Integration | TBD | 1 | ACTIVE |
| NFR-003 | Backup/Restore | 11, 12, 16, 19, 20 | TBD | TBD | Import/Export | TBD | 1 | ACTIVE |
| NFR-004 | Secret非公開 | 07, 15, 16, 20 | #1/#2/#3 | GitHub Secrets / deploy workflow | static/CI | PR #3 / deploy | 1 | ACTIVE |
| NFR-008 | Multi-user同時更新 | 08, 11, 16, 20 | TBD | TBD | concurrency test | TBD | 2 | DEFERRED |

Function Requirementは `01_REQUIREMENTS.md` の具体化Issueで順次追加する。

## 4. NFR Evidence

NFRはCategory名だけで完了扱いにしない。可能なものは以下を持つ。

- Target
- Measurement
- Environment
- Evidence

TargetがTBDの場合は、まずBaselineを測定し、根拠あるSLO候補を後続Issueで決める。

## 5. Rule

1. Requirement IDを採番
2. Design IDまたはDocumentを関連付け
3. Issue/PR
4. Implementation
5. Test
6. Evidence
7. Status

## 6. Coverage Review

Release / Phase Gateで確認する。

- ACTIVE RequirementにDesignがある
- Implementationまたは未実装理由がある
- Test方法がある
- Production確認が必要なRequirementにEvidenceがある
- REPLACED/DEFERRED/REMOVEDに理由がある
- 実装だけ存在してRequirement/Designへ紐づかない機能がない
