# Design Management

## 1. 目的
設計をDocument作成作業ではなく、Requirement・Implementation・Test・OperationをつなぐControl Planeとして管理する。

## 2. 正本

- Approved: GitHub `main`
- Proposed: Issue Branch / Pull Request
- Decision history: Git / PR / ADR
- Visual review: `docs/design/`
- Evidence: GitHub / Google Drive / external dashboard
- Chat: working conversation

## 3. Design Layers

```text
Requirement
  ↓
Architecture / Foundation / Common
  ↓
Function / Screen / Data / Interface
  ↓
Security / NFR / Public Web / Analytics / Operations
  ↓
Test / Traceability
  ↓
Implementation / Production Evidence
```

## 4. 朝マズメ潮ナビから継承するもの

- GitHub設計を正本にする
- HTMLで画面・InteractionをBrowser reviewする
- smartphone review
- statusを確定 / 暫定 / TBD / Deferredで区別

改善点:
- 巨大HTMLを唯一の正本にしない
- System / App / Foundation / Commonの責務を分離
- Security / NFR / Analytics / SEO / LLMOを明示的なDesignへ昇格
- TraceabilityをRequirementからProduction Evidenceまで伸ばす

## 5. Change Flow

Small Change:
```text
Issue -> Design update -> Implementation -> Test -> PR -> Human review -> Merge
```

Significant Design Change:
```text
Design Issue -> Design Branch -> Design review -> Design merge
 -> Implementation Issue -> Code/Test -> Human approval -> Merge
```

Architecture、Data schema、Authentication、Authorization、Security boundary、external IF等は原則Significantとして扱う。

## 6. Update Triggers

| Change | Required Design |
| --- | --- |
| Purpose / Scope | 00 / 01 |
| Hosting / Runtime / DB | 02 / 07 + ADR |
| Module / State | 03 / 08 |
| Directory | 04 / 21 |
| Function | 09 + 06 |
| Screen / Route / Item / Event | 10 + design/ |
| Data / Table / ER / Transaction | 11 |
| API / External IF / File | 12 |
| Report / Batch / Notification / Workflow | 13 |
| Code / Message / Term | 14 |
| Security / Header / Authz | 15 + SECURITY_BASELINE |
| NFR | 16 + 06 + 20 |
| SEO / LLMO / GSC | 17 + PUBLIC_WEB_QUALITY |
| Analytics / Log / Audit | 18 |
| Operation / Recovery / Release | 19 + RELEASE_CHECKLIST |
| Test strategy | 20 |
| Naming | 21 |

## 7. Project-specific vs Baseline

Baselineには「どう考えるか」を置き、Project-specific Designには次を置く。

- 実際の採用値
- 非採用理由
- URL / environment
- test / measurement
- production evidence

例: Security Headerの一般論は `SECURITY_BASELINE.md`、このAppでのCSP値は `15_SECURITY_DESIGN.md`。

## 8. Versioning

- latest approved = main
- proposal = PR branch
- history = Git
- release snapshot = tag/release
- `final2` 等のcopy fileを作らない

## 9. ADR

重要な技術判断はADRで理由を残す。Accepted ADRを変更する場合は新ADRでsupersedeする。

## 10. Traceability

`06_REQUIREMENTS_TRACEABILITY.md` で以下を追う。

```text
Requirement
 -> Design ID / ADR
 -> Issue / PR
 -> Implementation
 -> Test
 -> Evidence
 -> Status
```

## 11. Visual Design

Wireframe / Mock / Productionを区別する。

```text
Wireframe -> 情報構造
HTML / React Mock -> 見た目・状態・responsive
Production -> real data / security / performance
```

Design PreviewはProductionと分離し、indexさせない。

## 12. N/A Rule

帳票、Batch、Mail等が存在しない場合でも、単にDocumentを省略して「忘れた」のか「不要」なのか不明にしない。

小規模Phaseでは共通Document内に `N/A` を明記し、必要になった時点で独立仕様へ展開する。

## 13. Review Checklist

- Requirement整合
- Scope / Out of Scope
- Architecture責務
- Security / Privacy
- NFR / measurement
- Production / Preview分離
- Failure / fallback
- Data integrity / concurrency
- Mobile / accessibility
- SEO / LLMO / Analyticsの採否
- Testability / Evidence
- Rollback / Recovery
- TBDを勝手に確定していない
- duplicate source of truthがない

## 14. Design Debt

実装優先で設計更新を後回しにした場合はIssue化し、完了扱いにしない。
