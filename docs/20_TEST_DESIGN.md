# Test Design

## 1. 目的

Requirement / Design / Implementation / EvidenceをTestで接続する。

## 2. Test Layers

| Layer | Type | 主対象 |
| --- | --- | --- |
| Domain | Unit | score calculation / invariant |
| Application | Unit/Integration | use case / state |
| Infrastructure | Integration | storage / API / D1 |
| UI | Component/E2E | major flow / mobile |
| Security | Static/Dynamic | injection / authz / headers |
| NFR | Performance/Recovery/Accessibility | quality target |
| Release | Smoke/Manual | Production |

## 3. Phase 1 Test Foundation

Phase 1では外部Test frameworkを追加せず、既存のTypeScriptとNode 24標準 `node:test` を利用する。

```text
tests/*.test.ts
  ↓ tsc -p tsconfig.test.json
.test-dist/**/*.test.js (CommonJS)
  ↓ node --test
CI pass / fail
```

実行コマンド:

```bash
npm test
```

理由:
- 追加Dependencyなし
- Domain/Application/Infrastructureのpure TypeScriptをTest可能
- Templateへ持ち込みやすい
- React Component/E2Eが必要になった時点で専用frameworkを別判断できる

`.test-dist` は一時生成物でありcommitしない。

## 4. Current Automated Coverage

Domain:
- 3/4人Participant validation
- duplicate participant
- 3人/4人 ranked Score calculation
- 1位Score自動計算
- input order保持
- integer Score Point validation
- Game Score合計0
- ParticipantSegment / Game player集合整合
- negative Score Point
- Chip balance

Infrastructure:
- AppDataSchema exact root validation
- schema v2 round trip
- localStorage adapter
- v1 empty-games -> v2 migration
- v1 Gameありmigration拒否
- LocalStorageGameRepository list/find/save

Application:
- Group作成
- Player + GroupMember atomic save
- Session + initial Segment atomic save
- invalid Session開始時のpartial write防止
- Backup export/import
- invalid import時のexisting data保護

## 5. CI Gate

GitHub Actionsは次の順序で実行する。

```text
Install
 -> Lint
 -> Test
 -> Build
 -> Secret validation (main only)
 -> Deploy (main only)
```

Test failure時はBuild/Deployへ進まない。

## 6. Security Tests

- SQL injection resistance
- XSS / output handling
- authorization / IDOR
- CSRF when applicable
- CORS
- mass assignment
- invalid JSON / import
- rate limit
- secret leakage
- Security Headers production response

Phase 1ではinvalid JSON / import validationの一部のみ自動化済み。その他は該当Phaseで追加する。

## 7. NFR Tests

- performance baseline / regression
- backup / restore
- migration rehearsal
- concurrency / stale update
- accessibility
- supported browser/device
- rollback rehearsal

## 8. UI State Tests

React UI接続後に別Issueで追加する。

- normal
- loading
- empty
- validation error
- API/storage error
- disabled
- unauthorized / forbidden
- long text
- narrow mobile width
- keyboard / focus

## 9. Evidence

自動Test結果はGitHub ActionsをEvidenceとする。

Manual evidence:
- smartphone verification
- Search Console
- Cloudflare Dashboard
- external Security Header diagnostic

Issue/PRへ実施対象、日付、結果、未完了を残す。

## 10. Traceability

`06_REQUIREMENTS_TRACEABILITY.md` で:

```text
Requirement
 -> Design ID
 -> Issue/PR
 -> Implementation
 -> Test
 -> Evidence
```

を追跡する。
