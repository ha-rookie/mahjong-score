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

Phase 1: Runtime authなし。Phase 2以降はFrontend UX制御とAPI-side Authorizationを分離する。

## 7. Logging

Logger contractはbusiness codeからconsole/platform APIを分離する。NoopLoggerはAudit実装済みを意味しない。
