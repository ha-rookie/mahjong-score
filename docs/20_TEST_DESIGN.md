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

## 3. Security Tests

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

## 4. NFR Tests

- performance baseline / regression
- backup / restore
- migration rehearsal
- concurrency / stale update
- accessibility
- supported browser/device
- rollback rehearsal

## 5. UI State Tests

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

## 6. Evidence

Test resultは可能な限りCIへ寄せる。

Manual evidence:
- smartphone verification
- Search Console
- Cloudflare Dashboard
- external Security Header diagnostic

Issue/PRへ実施対象、日付、結果、未完了を残す。

## 7. Traceability

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
