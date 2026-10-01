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
| APP-005 | Infrastructure | localStorage / Worker API・D1 adapter / runtime composition | UI stateを持つ |
| APP-006 | Shared | Error/Validation/Logger/KeyValueStore等のDomain非依存共通契約 | Mahjong固有Modelへ依存 |

## 4. Dependency Rules

- Presentation → Application / sharedのみを基本とする
- Application → Domain / Ports / shared
- Domain → shared validation等の汎用契約のみ許可
- Infrastructure → Ports / Domain / shared
- shared → Mahjong Domainへ依存しない
- Module循環依存は禁止

## 5. Persistence / Source of Truth

### 5.1 Production

Productionで扱うGroup / Player / Session / Gameの業務データは **D1をSource of Truth** とする。

```text
Use Case
 -> Repository Port
 -> API Repository
 -> Worker API
 -> D1
```

Authentication / Authorization側で取得したUser・Group membershipと、Application側が読み書きする業務データは同じD1系統を前提とする。認証だけD1、業務データだけlegacy localStorageという暗黙の分岐を正常状態として扱わない。

### 5.2 Runtime persistence selection

Browser compositionでは `mahjong-score:persistence-mode` を参照する。

| marker | 選択するPersistence | 位置づけ |
| --- | --- | --- |
| `local` | localStorage Repository | Phase 1互換・legacy migration用の明示モード |
| `d1` | API / D1 Repository | Production通常経路 |
| 未設定 | API / D1 Repository | Production default |
| その他の値 | API / D1 Repository | 未知値からlegacy localへsilent fallbackしない |

設計Invariant:

- `local` は明示された場合のみ選択する
- marker未設定をPhase 1 localStorageへ戻す条件にしない
- Production defaultはD1とする
- 新しいBrowser context / Home Screen Web App / storage未初期化contextでも、認証済みであればApplication data accessがlegacy localへ分岐しない
- localStorageを残す場合も、Productionの業務データ正本とは扱わない

### 5.3 Phase 1 compatibility

Phase 1ではUIから `localStorage` を直接呼ばず、Use Case → Repository Port → localStorage Adapterで保存していた。

```text
Use Case
 -> Repository Port
 -> LocalStorage Repository
 -> LocalStorageAppDataStore
 -> KeyValueStore
 -> Web Storage
```

localStorage keyは `mahjong-score:app-data:v1`、AppDataSchemaは `schemaVersion=1` を使用する。

この経路は既存local dataの保持・migration互換のため残す。Productionの通常利用では、明示的な `local` markerがない限り選択しない。

## 6. Atomic Operation Boundary

Phase 1では複数collectionを同時更新する操作を1回のstore writeへまとめる。

- Player登録 + GroupMember追加 → `createForGroup`
- Session作成 + initial ParticipantSegment作成 → `createWithInitialSegment`

D1 / Worker API側ではAuthorization、optimistic concurrency、data integrityをserver-side boundaryで保証する。

## 7. Use Cases

主要Use CaseはApplication層に置き、Persistence implementationを知らない。

代表例:
- CreateGroupUseCase
- AddPlayerToGroupUseCase
- StartSessionUseCase
- AddGameResultUseCase
- FinalizeSessionUseCase
- GetActiveSessionUseCase
- ExportBackupUseCase
- ImportBackupUseCase

Clock / ID Generatorをinjectし、時刻・採番をUse Case内部で固定実装しない。

## 8. Error / Validation

- localStorage read/write failure → AppError
- JSON parse failure → AppError
- schema mismatch → AppError
- API / D1 access failure → API error contractとして扱う
- Domain invariant → ValidationResult
- Backup importはschema validation成功後のみreplace
- Persistence選択の曖昧状態を、空データとして正常化しない

## 9. Phase 1 → D1 Migration Boundary

Application Portを維持したまま、ProductionのGroup / Player / Session / Game RepositoryをWorker API / D1実装へ切り替えている。

```text
Production
Application Use Case
 -> Repository Port
 -> Api*Repository
 -> Worker API
 -> D1

Legacy explicit local mode
Application Use Case
 -> Repository Port
 -> LocalStorage*Repository
 -> LocalStorageAppDataStore
```

`createBrowserServices()` がこのComposition Rootを担当する。Persistenceのdefault変更は画面単体の変更ではなく、Application全体が参照するSource of Truthを変えるため、認証・認可・業務データの整合性を含めて扱う。

## 10. Test Architecture

- shared/domain/application: Unit target
- localStorage adapter: Integration target
- Worker API / D1 repository: Integration / security target
- browser composition / Persistence選択: Boundary regression target
- UI: Component/E2E
- security/NFR: `20_TEST_DESIGN.md`

特に複数Persistenceを持つ間は、`local` / `d1` / marker未設定の選択結果を回帰テスト対象とする。

## Optimistic concurrency boundary

Production mutations must preserve the state observed by the user. A mutation must not replace its concurrency token with a newer value fetched immediately before the write.

For version-managed Session/Game flows:

`Read/View -> observed version -> user action -> mutation(expectedVersion) -> conditional D1 write -> stale_update -> reload/recovery`

Rules:
- Game and Session update/delete commands carry the version observed by the UI
- repository existence checks must not change update intent or replace the observed token
- Game create/update/delete advances the parent Session version in the same D1 batch transaction, because Session results are the consistency aggregate reviewed before finalization
- Session finalization uses the Session snapshot shown on the result-review screen; any intervening Game mutation advances Session.version and makes that finalization stale
- Group name/rule edits use Group.updatedAt as a compare-and-set token
- membership/link admin mutations compare the observed role/link state before applying changes
- stale/already-removed conflicts must not silently retry as last-write-wins; the UI reloads current state and asks the user to re-evaluate
- create-only invariants remain database-backed (for example one active Session per Group and unique Game sequence per Session)

This boundary is a regression-sensitive composition rule. New mutable resources must explicitly document whether they are create-only/idempotent, last-write-wins by design, or protected by an optimistic concurrency token.



## 11. Browser / PWA navigation history

Presentationの主要なユーザー起点画面遷移はBrowser Historyと同期する。

- Homeを初期history entryとして扱う
- Home → History / Performance / Session Setup / Group / Member / Rule Settings、およびHistory → Results、Performance → Player Performanceのようなユーザー起点遷移はhistory entryを追加する
- Headerの戻ると端末/Browserの戻るは同じhistory entryを消費する
- 業務処理完了後の状態遷移（Session開始・終了、Group切替、設定保存等）は新しい戻り先を作らない
- 未保存Session入力がある場合、popstateでも既存のnavigation confirmationを経由し、端末戻るだけで入力を破棄しない
- Homeより前の履歴はApplicationが擬似的に塞がず、Browser/PWA本来の戻る/終了動作へ委ねる

この境界はIssue #316で導入する。URL router導入、DB/API変更は含めない。
