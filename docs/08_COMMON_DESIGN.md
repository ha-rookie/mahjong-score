# 共通設計

## 1. 目的
各Featureで重複実装しない横断契約とReact共通Componentの責務を定義する。

## 2. Shared Foundation

| COM ID | Contract | Responsibility | Template Candidate |
| --- | --- | --- | --- |
| COM-001 | AppError | Error code / internal message / user message / retryable | Yes |
| COM-002 | Result<T> | Success/Failureを明示 | Yes |
| COM-003 | ValidationResult | validation issueの共通表現 | Yes |
| COM-004 | Logger | debug/info/warn/error contract | Yes |
| COM-005 | NoopLogger | Logging未導入Phaseの安全な差替え | Yes |
| COM-006 | Repository Ports | Persistence実装の差替え境界 | PatternとしてYes |

shared packageは麻雀Domainに依存させない。

## 3. React共通Component

Template候補: Button / Field / Card / Dialog / Toast / EmptyState / Header / Navigation / Loading / Error / PermissionGate / ErrorBoundary。

UI Componentは別IssueでShowcaseとともに実装する。

## 4. Authentication / Authorization

Phase 1: Runtime authなし。

Phase 2以降:
- FrontendはRouteGuard / PermissionGateでUX制御
- API側AuthorizationをSecurity上の正本
- deny by default
- resource scope確認

## 5. Validation

- UI validationとserver/domain validationを分離
- 型、範囲、enum、必須、文字数を明示
- import dataを信用しない
- Domain invariantはpure validationとして再利用可能にする

## 6. Error

AppErrorはUser表示とOperation detailを分けられる契約とする。Secret/SQL/stack等をUserへ出さない。

## 7. Logging

Logger contractはbusiness codeからconsole/platform APIを分離する。Phase 1はNoopLogger利用可能。Access/Application/Auditの本実装は `18_ANALYTICS_OBSERVABILITY.md` に従う。

## 8. Duplicate / Concurrency

二重tap防止UIだけに依存しない。Phase 2でidempotency / optimistic lock等を追加する。

## 9. Showcase

shared/UIをReact Templateへ昇格する際は正常・error・disabled・permission・mobile等の状態をShowcaseする。
