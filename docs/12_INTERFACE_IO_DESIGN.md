# Interface / File I/O設計

## 1. 目的
内部/外部API、外部Service、Import/Export Fileを一元的に設計する。

## 2. Interface Catalog

| IF ID | 名称 | Direction | Auth | Timeout | Retry | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IF-001 | Cloudflare Static Delivery | Inbound | Public | N/A | Browser | 1 | Active |
| IF-002 | Worker API | Inbound | TBD | TBD | TBD | 2 | Deferred |
| IF-003 | D1 | Internal | Binding | N/A | App logic | 2 | Deferred |
| IF-004 | LINE Login | External | OAuth/OIDC相当 | TBD | TBD | 3 | Deferred |

## 3. API Definition Template

- method / path
- purpose
- authentication
- authorization
- request schema
- validation
- response schema
- status code
- error code
- idempotency
- rate limit
- timeout
- retry
- audit
- correlation ID

SQL実装はparameterized query / bindを使用し、request値をSQL文字列へ連結しない。

## 4. File Catalog

| FILE ID | 名称 | Format | Direction | Encoding | Size Limit | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| FILE-001 | Backup JSON | JSON | Export/Import | UTF-8 | TBD | 1 |

## 5. Backup JSON

必須設計:
- schemaVersion
- export timestamp
- application version
- data sections
- stable IDs
- integrity validation

Import:
- JSON parse errorを検出
- schema allowlist
- unknown propertyの扱いを決める
- prototype pollution等を考慮
- size limit
- 全体validation後に反映
- 部分反映しない

## 6. Upload / Download

Phase 1はBackup JSONのみ。

一般原則:
- filenameを信用しない
- extensionだけでtype判定しない
- MIME / size / content validation
- path traversal対策
- download responseのContent-Type / Content-Dispositionを明示
