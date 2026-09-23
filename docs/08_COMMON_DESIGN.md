# 共通設計

## 1. 目的
各機能で重複実装しない横断機能とReact共通Componentの責務を定義する。

## 2. 共通Layer

```text
src/
├─ components/
│  ├─ ui/
│  └─ layout/
├─ shared/
│  ├─ auth/
│  ├─ authorization/
│  ├─ logging/
│  ├─ validation/
│  ├─ errors/
│  ├─ api/
│  ├─ security/
│  └─ observability/
├─ features/
├─ domain/
├─ application/
└─ infrastructure/
```

物理配置の正本は `04_REPOSITORY_STRUCTURE.md`。

## 3. React共通Component

Template候補:
- Button / IconButton
- TextField / NumberField / Select
- Card / Section
- Dialog / Sheet
- Toast / Alert
- EmptyState
- AppHeader / BottomNavigation
- Stat / List / Table shell
- Loading / Error
- PermissionGate
- ErrorBoundary

原則:
- 麻雀Domainに依存しない
- Propsで状態・variant・sizeを表現する
- accessibilityをComponent契約に含める
- 共通化のための例外Propsを増殖させない

## 4. Authentication / Authorization

AuthenticationとAuthorizationを分離する。

Frontend:
- RouteGuard
- PermissionGate
- Navigation表示制御

Server:
- APIごとのauthorizationをSecurity上の正本とする
- deny by default
- resource ownership / group scopeを確認する

Permission key例:
- `session.view`
- `session.create`
- `session.edit`
- `session.finalize`
- `score.correct`
- `member.manage`
- `backup.export`
- `backup.import`

Phase 1では実Securityとして認証・認可を実装済みとは扱わない。

## 5. Validation

- UI validationは操作性向上
- API validationはSecurity / Data Integrity
- 型、桁、範囲、enum、必須、format、文字数を明示する
- request bodyをDomain Objectへ無条件展開しない
- import dataもuntrusted inputとして扱う

## 6. Error

共通候補:
- `AppError`
- error code
- user message
- operation detail
- correlation ID
- retryable flag

Clientへstack trace、SQL、Secret、internal pathを返さない。

## 7. Logging

- Access Log
- Application Log
- Audit Log

を分離する。詳細は `18_ANALYTICS_OBSERVABILITY.md`。

## 8. Concurrency / Duplicate Request

- button disabledだけを唯一の防止策にしない
- 二重tap、reload、back操作でも整合性を壊さない
- Phase 2ではidempotency / optimistic lock / version checkを機能特性に応じて使う

## 9. Showcase

React Templateへ昇格するComponent / shared機能はShowcaseで状態を確認できるようにする。

最低確認:
- normal / variant / size
- disabled / loading / error / empty
- long text
- mobile width
- keyboard / focus
- permission差分
