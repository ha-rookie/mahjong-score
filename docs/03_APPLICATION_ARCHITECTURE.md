# Application Architecture

## 1. 文書目的
App内部の論理構成、Module責務、Dependency、State、Error boundaryの正本とする。

## 2. Logical Architecture

```text
Presentation / React
      ↓
Application / Use Case
      ↓
Domain
      ↑
Application Ports
      ↑
Infrastructure

Cross-cutting shared contracts:
Error / Validation / Logging / Auth / Observability
```

## 3. Component Responsibilities

| ID | Component | Responsibility | Must Not Do |
| --- | --- | --- | --- |
| APP-001 | Presentation | UI state、入力、表示 | localStorage/D1へ直接access |
| APP-002 | Application | Use case orchestration | React DOMへ依存 |
| APP-003 | Domain | Entity、Invariant、純粋なBusiness rule | React、Browser API、localStorage、Cloudflareへ依存 |
| APP-004 | Ports | Repository等の抽象契約 | 具体Storageを知る |
| APP-005 | Infrastructure | localStorage / future API/D1 adapter | UI stateを持つ |
| APP-006 | Shared | Error/Validation/Logger等のDomain非依存共通契約 | Mahjong固有Modelへ依存 |

## 4. Dependency Rules

- Presentation → Application / sharedのみを基本とする
- Application → Domain / Ports / shared
- Domain → shared validation等の汎用契約のみ許可
- Infrastructure → Ports / Domain
- shared → Mahjong Domainへ依存しない
- Module循環依存は禁止

## 5. State / Persistence

Phase 1: Repository interfaceの実装としてlocalStorageを利用する。UIから直接 `localStorage` を呼ばない。

Phase 2: 同じUse CaseからWorker API Repositoryへ差し替えられる境界を維持する。

## 6. Domain Model

主要Model:
- Group / Player / GroupMember
- Session / SessionParticipantNote / ChipResult
- ParticipantSegment
- Game / GameResult / GameTag
- AppDataSchema

Stable IDはstringとして扱い、display nameやarray indexをidentityにしない。

## 7. Repository Ports

- GroupRepository
- PlayerRepository
- SessionRepository
- GameRepository

Repositoryは `Result<T, AppError>` を返し、Storage例外をUIへ直接漏らさない。

## 8. Error / Validation / Logging

Shared reusable contracts:
- `AppError`
- `Result<T>`
- `ValidationResult` / `ValidationIssue`
- `Logger`
- `NoopLogger`

Phase 1のNoopLoggerはAudit実装済みを意味しない。Server AuditはPhase 2以降。

## 9. Runtime Sequence

```text
User Action
 -> Presentation validation
 -> Application Use Case
 -> Domain validation/calculation
 -> Repository Port
 -> Infrastructure adapter
 -> Result
 -> UI render
```

## 10. Error Boundary

- Domain validation: ValidationResult
- Infrastructure failure: AppError
- unexpected UI exception: future ErrorBoundary
- Analytics failure: Core機能へ波及させない

## 11. Test Architecture

- shared/domain: Unit target
- application: Unit/Integration
- infrastructure: Integration
- UI: Component/E2E
- security/NFR: `20_TEST_DESIGN.md`

## 12. TBD

- Test frameworkは別Issueで選定
- Routing / state libraryは必要性が出た時点で判断
- PWA採否はTBD
