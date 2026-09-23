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
Error / Validation / Logging / Storage / Auth / Observability
```

## 3. Component Responsibilities

| ID | Component | Responsibility | Must Not Do |
| --- | --- | --- | --- |
| APP-001 | Presentation | UI state、入力、表示 | localStorage/D1へ直接access |
| APP-002 | Application | Use Case orchestration | React DOMへ依存 |
| APP-003 | Domain | Entity、Invariant、純粋なBusiness rule | React、Browser API、localStorage、Cloudflareへ依存 |
| APP-004 | Ports | Repository / Clock / ID / AppDataStore等の抽象契約 | 具体Storageを知る |
| APP-005 | Infrastructure | localStorage / runtime adapter / future API/D1 adapter | UI stateを持つ |
| APP-006 | Shared | Error/Validation/Logger/KeyValueStore等のDomain非依存共通契約 | Mahjong固有Modelへ依存 |

## 4. Dependency Rules

- Presentation → Application / sharedのみを基本とする
- Application → Domain / Ports / shared
- Domain → shared validation等の汎用契約のみ許可
- Infrastructure → Ports / Domain / shared
- shared → Mahjong Domainへ依存しない
- Module循環依存は禁止

## 5. Phase 1 Persistence

UIから `localStorage` を直接呼ばず、Use Case → Repository Port → localStorage Adapterで保存する。

```text
Use Case
 -> Repository Port
 -> LocalStorage Repository
 -> LocalStorageAppDataStore
 -> KeyValueStore
 -> Web Storage
```

localStorage keyは `mahjong-score:app-data:v1` に一元化し、AppDataSchemaの `schemaVersion=1` を保存する。

## 6. Atomic Operation Boundary

Phase 1では複数collectionを同時更新する操作を1回のstore writeへまとめる。

- Player登録 + GroupMember追加 → `createForGroup`
- Session作成 + initial ParticipantSegment作成 → `createWithInitialSegment`

Delete/cascadeは未決のためRepository Portから削除操作を外し、AIが勝手に削除意味を確定しない。

## 7. Use Cases

Issue #8で追加する最小Use Case:
- CreateGroupUseCase
- AddPlayerToGroupUseCase
- StartSessionUseCase
- ExportBackupUseCase
- ImportBackupUseCase

Clock / ID Generatorをinjectし、時刻・採番をUse Case内部で固定実装しない。

## 8. Error / Validation

- localStorage read/write failure → AppError
- JSON parse failure → AppError
- schema mismatch → AppError
- Domain invariant → ValidationResult
- Backup importはschema validation成功後のみreplace

## 9. Phase 2 Migration

Application Portを維持し、localStorage RepositoryをWorker API/D1 Repositoryへ差し替える。D1ではtransaction / authorization / optimistic lockingを追加する。

## 10. Test Architecture

- shared/domain/application: Unit target
- localStorage adapter: Integration target
- UI: Component/E2E
- security/NFR: `20_TEST_DESIGN.md`

Test frameworkは別Issueで導入する。
