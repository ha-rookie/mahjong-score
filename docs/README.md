# Design Documentation Index

このDirectoryは、三麻スコアを題材にした「業務システムAI駆動開発PoC」の設計正本を管理する。

## 1. Source of Truth

- 承認済み最新設計: GitHub `main`
- 提案中設計: Issue Branch / Pull Request
- 重要判断: `docs/adr/`
- 視覚レビュー: `docs/design/`
- 構築証跡: Google Drive
- Chat / Notion: 検討・最終設計同期に利用するが、実装に対するRepository正本はGitHub main

Design Preview / Design Portalはレビュー面であり、正本そのものではない。

## 2. Core Design

| Document | Responsibility |
| --- | --- |
| `00_PROJECT_OVERVIEW.md` | 背景、目的、対象、Scope |
| `01_REQUIREMENTS.md` | 機能要件、非機能要件、制約 |
| `02_SYSTEM_ARCHITECTURE.md` | System Context、Hosting、Data Flow、Environment |
| `03_APPLICATION_ARCHITECTURE.md` | App内部Layer、Module、State、Error boundary |
| `04_REPOSITORY_STRUCTURE.md` | Directory、source/generated、配置Rule |
| `05_DESIGN_MANAGEMENT.md` | 設計の変更・承認・版管理 |
| `06_REQUIREMENTS_TRACEABILITY.md` | Requirement → Design → Issue → Test → Evidence |

## 3. Enterprise System Design

| Document | Responsibility |
| --- | --- |
| `07_FOUNDATION_DESIGN.md` | 基盤、環境、Deploy、Secret、Backup、Locale |
| `08_COMMON_DESIGN.md` | 共通UI、Auth/Authz、Validation、Error、Logging |
| `09_FUNCTION_DESIGN.md` | 機能一覧、機能詳細、処理機能記述 |
| `10_SCREEN_DESIGN.md` | Screen Map、遷移、項目、Event、Mapping、Wireframe |
| `11_DATA_DESIGN.md` | Logical Model、Table/View、ER、Dictionary、State、Transaction、排他 |
| `12_INTERFACE_IO_DESIGN.md` | API、外部IF、File Import/Export |
| `13_BATCH_REPORT_NOTIFICATION_WORKFLOW.md` | 帳票、Batch、通知、Workflow |
| `14_CODE_MESSAGE_TERMINOLOGY.md` | 業務Code、Message、Label、Glossary |
| `15_SECURITY_DESIGN.md` | Project固有Security、Threat、Security Headers |
| `16_NFR_DESIGN.md` | NFR Catalog、SLI/SLO、RASIS review |
| `17_PUBLIC_WEB_DISCOVERY_DESIGN.md` | SEO、LLMO、Search Console、Public Trust |
| `18_ANALYTICS_OBSERVABILITY.md` | Cloudflare Analytics、Log、Audit、Observability |
| `19_OPERATIONS_RELEASE_DESIGN.md` | Monitoring、Incident、Recovery、Release |
| `20_TEST_DESIGN.md` | Unit / Integration / E2E / Security / NFR / Smoke |
| `21_D1_RECOVERY_RUNBOOK.md` | D1 Time Travel、Production restore guardrail、Preview rehearsal |
| `21_NAMING_STANDARD.md` | Design ID、source、API、DB、File等の命名 |
| `22_SE_USER_TEST_READINESS.md` | SE向けUser Test前のRelease Candidate Gate、task script、defect severity、説明ポイント |
| `23_D1_PERFORMANCE_BENCHMARK.md` | Historical Preview D1 benchmark evidence。現在の実行手順ではない |
| `23_PERFORMANCE_D1_TEST.md` | Current local / isolated Performance D1 test strategy、query-count guardrail、smartphone scenario |

## 4. Cross-project Standards

以下はProject固有値ではなく共通Baseline。個別設計から参照する。

- `SECURITY_BASELINE.md`
- `PUBLIC_WEB_QUALITY.md`
- `CLOUDFLARE_SETUP.md`
- `DESIGN_PREVIEW.md`
- `ASSET_WORKFLOW.md`
- `RELEASE_CHECKLIST.md`
- `GIT_WORKFLOW.md`
- `HUMAN_AI_COLLABORATION.md`
- `TROUBLESHOOTING.md`

## 5. Visual Review

`design/index.html` をDesign Portalの入口とする。

役割:
- Screen/Wireframe/Mockのレビュー
- 設計書Catalogの横断確認
- Status / TBDの可視化

Production Appとは分離し、Design Previewを公開する場合はnoindexを原則とする。

## 6. Design IDs

- `REQ-xxx`: Requirement
- `NFR-xxx`: Non-functional requirement
- `ARCH-xxx`: System architecture
- `APP-xxx`: Application architecture
- `BASE-xxx`: Foundation
- `COM-xxx`: Common design
- `FUNC-xxx`: Function
- `SCR-xxx`: Screen
- `ITEM-xxx`: Screen item
- `EVT-xxx`: Event
- `DATA-xxx`: Data
- `MAP-xxx`: Screen/API/DB mapping
- `IF-xxx`: Interface
- `FILE-xxx`: File I/O
- `RPT-xxx`: Report
- `BAT-xxx`: Batch
- `CODE-xxx`: Business code
- `MSG-xxx`: Message
- `SEC-xxx`: Security
- `AUTH-xxx`: Authentication/Authorization
- `LOG-xxx`: Log/Audit
- `TERM-xxx`: Terminology
- `TBD-xxx`: Undecided
- `ADR-xxxx`: Architecture Decision

命名詳細は `21_NAMING_STANDARD.md`。

## 7. No Duplicate Source of Truth

同じ仕様を複数Documentへ全文コピーしない。

例:
- Hosting採用理由 → System Architecture / ADR
- Cloudflare設定手順 → Cloudflare Setup
- Security Header共通基準 → Security Baseline
- Project固有Header値 → Security Design
- Button配置 → Screen Design
- Buttonが必要な理由 → Requirements / Function Design
- Search Console共通手順 → Public Web Quality
- このAppでのSearch公開判断 → Public Web / Discovery Design

## 8. Design Change

1. Requirement / impact確認
2. 正本Designを先に更新
3. 必要ならWireframe / HTML / React Mock
4. IssueへDesign IDとAcceptance Criteria
5. Implementation / Test
6. PRでDesign + Codeを同時review
7. Human approval
8. Merge
9. Production Evidence
10. Design実態同期

## 9. Current Phase / Gate

Phase 2 runtime（Worker API / D1 / Security / concurrency / recovery）とPhase 3主要機能（LINE Login / invitation / Group authorization / multi-device）は実装済み。

現在は **Phase 3 Release Candidate Gate / SE User Test readiness（Issue #165）**。

2026-09-26時点:
- known application S1/S2 defects: 0
- #137: DB / local 5y・10y performance evidence取得済み、Production smartphone felt-performance待ち
- #201: 0半荘Session cancel実装済み、smartphone smoke待ち
- #160 PWA: Deferred
- remote D1へアクセスできずLINE Loginを実行できないため、SE User Test GateはOperational Blockerで停止中
- PR CIはlocal D1まで。Preview / Production remote D1へ自動アクセスしない
- Production deployは`main`からのmanual `workflow_dispatch`のみ

再開順序は `22_SE_USER_TEST_READINESS.md` のResume Checklistを正本とする。
