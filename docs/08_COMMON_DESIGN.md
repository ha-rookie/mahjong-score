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
| COM-007 | KeyValueStore | Web Storage等のkey/value storage抽象 | Yes |
| COM-008 | Clock | 時刻取得の抽象 | Yes |
| COM-009 | IdGenerator | stable ID採番の抽象 | Yes |

shared packageは麻雀Domainに依存させない。

## 3. Storage Error Contract

Storageの例外を直接UIへ投げない。以下をAppErrorへ正規化する。

- `storage_read_failed`
- `storage_write_failed`
- `storage_json_invalid`
- `storage_schema_invalid`
- `storage_schema_unsupported`

User向け文言と内部detailを分離する。

## 4. Input / Import Validation

- 外部File / localStorage内容をtrusted objectとみなさない
- root objectの許可fieldを固定
- schemaVersionを確認
- collection/item shapeを検証
- unknown root propertyを拒否
- validation成功後のみreplace

## 5. React共通Component

Template候補: Button / Field / Card / Dialog / Toast / EmptyState / Header / Navigation / Loading / Error / PermissionGate / ErrorBoundary。UI Componentは別IssueでShowcaseとともに実装する。

## 6. Authentication / Authorization

Phase 2ではFrontend UX制御とAPI-side Authorizationを分離する。

- Authentication: LINE Login
- Application session: signed HttpOnly / Secure / SameSite=Lax cookie
- Authorization source: authenticated internal User ID
- System Admin: system-wide administration
- Group Admin: Group-scoped administration allowed by API
- Member: normal gameplay/read operations
- Frontendのbutton非表示はUX制御でありSecurity境界ではない
- Worker APIがresourceのGroup ownership / Membership / roleを毎回検証する

## 7. Logging

Client/Application側のLogger contractとserver Audit Logを分離する。

- Client共通Logger: business codeからconsole/platform APIを分離
- Worker Audit Log: auth/authz failureと重要操作をJSON構造化Logで記録
- requestId: CF-Ray優先、fallbackはUUID
- Secret / token / Cookie / request body / Memo本文 /不要なPIIは記録しない

NoopLoggerはAudit実装の代替ではない。

## 8. API Error Contract

Phase 2でUIが扱う代表的なAPI error:
- `unauthorized`: 401。application sessionなし/無効
- `forbidden`: 403。Group Membership / role不足
- `stale_update`: 409。Session/Gameのversion競合
- validation error: 400
- resource conflict: 409

UIはHTTP statusだけでなくerror codeを利用し、User向けMessageと内部detailを分離する。

## 9. Shared Refresh / Toast Behavior

- Active Sessionのmanual refreshはD1の最新状態を再取得する
- 未保存入力がある場合のみ破棄確認する
- refresh失敗時は未保存入力を保持する
- refresh後はscroll positionを維持する
- success/error通知はfixed toastとしmain layoutを押し下げない
