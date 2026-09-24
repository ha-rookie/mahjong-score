# 非機能要件設計

## 1. 目的
NFRを「配慮事項」ではなく、測定・検証・運用可能なRequirementとして管理する。

## 2. NFR Catalog Schema

| Field | 内容 |
| --- | --- |
| NFR ID | NFR-xxx |
| Category | Availability / Performance / Security等 |
| Scenario | 品質要求が現れる状況 |
| Target | 目標 / 判定条件 |
| Measurement | 測定方法 |
| Environment | 実測条件 |
| Evidence | test / dashboard / review |
| Phase | 適用Phase |
| Status | ACTIVE / TBD / DEFERRED / N/A |

## 3. Category

- Availability
- Performance / Scalability
- Operability / Maintainability
- Migration / Portability
- Security
- Reliability
- Usability / Accessibility
- Integrity
- Efficiency
- Compatibility
- Cost
- Technical constraints

RASISは漏れ確認のreview lensとして使う。

## 4. Initial Catalog

| ID | Category | Scenario | Target | Measurement | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-001 | Usability | 卓上のスマホ入力 | 迷わず主要操作できる | 実機レビュー | 1 | ACTIVE |
| NFR-002 | Integrity | score/chip確定 | 合計0等のDomain invariantを守る | Unit/Integration | 1 | ACTIVE |
| NFR-003 | Recoverability | data喪失/誤更新 | Phase 1=JSON、Phase 2=D1 Time Travelで復旧可能 | import/export test + Preview recovery rehearsal | 1-2 | ACTIVE |
| NFR-004 | Security | Public repo / auth / deploy | Secret非公開、API-side authz、Production Security Headers | static review / CI / Production smoke | 1-2 | ACTIVE |
| NFR-005 | Performance | SPA初期表示 | Baseline測定後にSLO候補設定 | browser performance | 1 | TBD |
| NFR-006 | Availability | Production delivery | SLI定義後にSLO候補設定 | Cloudflare / smoke | 1 | TBD |
| NFR-007 | Accessibility | mobile UI | keyboard/focus/touchを満たす | manual + automated | 1 | ACTIVE |
| NFR-008 | Concurrency | multi-user update | stale updateを検知 | concurrency test | 2 | ACTIVE |
| NFR-009 | PWA | home screen / standalone | install可能でstandalone起動し主要静的Assetをcacheできる | manifest / service worker / smartphone verification | 3+ | DEFERRED |
| NFR-010 | Authorization | Group resource access | System Admin / Group Admin / Member権限をAPI側で強制する | authorization / IDOR test | 2 | ACTIVE |
| NFR-011 | Observability | auth/authz failure / important operation | requestId付きstructured audit logで追跡可能 | Worker log review / code review | 2 | ACTIVE |
| NFR-012 | Recovery operation | D1誤更新/誤削除 | RPO 1 minute target / RTO 60 minutes target、Human-controlled restore | Preview Time Travel rehearsal | 2 | ACTIVE |

## 5. SLI / SLO / SLA

- SLI: 実測指標
- SLO: Service目標
- SLA: 顧客との契約上保証

このPoCではSLAを原則N/Aとし、SLIを測定してから根拠あるSLO候補を決める。

## 6. Test Link

NFRは `20_TEST_DESIGN.md` と `06_REQUIREMENTS_TRACEABILITY.md` でEvidenceへ接続する。


## 7. Deferred NFR

NFR-009 PWAは2026-09-25のPhase 2完了監査でPhase 3以降へDeferredした。

理由:
- 現時点のコア価値はD1 / LINE Login / Group authorization / multi-device利用
- installability / standaloneは上記の成立条件ではない
- Service Worker導入はcache invalidation等の運用責任を増やす
- offline write/syncは別途競合解決設計が必要

Backlog: Issue #160


## 8. Phase 2 NFR Evidence

- NFR-003 / NFR-012: D1 recovery rehearsal run #36072191864
- NFR-004: Production Security Headers run #36071486621
- NFR-008: #146 / PR #147
- NFR-009: #160へDeferred
- NFR-010: Worker APIでSystem Admin / Group Admin / Memberを強制
- NFR-011: #154 / PR #155

長期性能試験はIssue #137でPhase 3以降へDeferredし、Phase 2完了条件から除外する。
