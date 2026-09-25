# Interface / File I/O設計

## 1. 目的
内部/外部API、外部Service、Import/Export Fileを一元的に設計する。

## 2. File Catalog

| FILE ID | 名称 | Format | Direction | Encoding | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| FILE-001 | Backup JSON | JSON | Export/Import | UTF-8 | 1 | Active |

## 3. Backup Envelope v1

```json
{
  "fileVersion": 1,
  "exportedAt": "ISO-8601 timestamp",
  "appVersion": "application version",
  "data": { "schemaVersion": 1 }
}
```

Export時はAppDataStoreの現在Dataを読み、metadata付きJSONへ変換する。

## 4. Import Validation

順序:
1. JSON parse
2. Backup envelope exact key validation
3. fileVersion確認
4. AppDataSchema exact root key validation
5. schemaVersion確認
6. collection/item shape validation
7. 全検証成功後のみreplace

失敗時は既存localStorageを変更しない。

## 5. Security / Robustness

- Backup内容をtrusted inputとみなさない
- unknown root propertyを拒否
- unsupported schemaを自動解釈しない
- SecretをBackupへ含めない
- 実在DataをRepositoryへcommitしない

## 6. API / External IF

Phase 2でWorker API / D1 / Authenticationを導入する。SQLはparameterized query / bindを必須とする。

初期Authentication providerはLINE Login。認証に必要な最小scopeを使用し、LINE側の具体設定・callback・token validationは公式仕様確認後に実装設計へ反映する。


## 7. Worker API baseline

Phase 2 API is same-origin under `/api`. Static SPA requests continue through the Workers Static Assets binding.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /api/health | Worker-to-D1 connectivity check |
| GET | /api/groups | Group read baseline |
| GET | /api/groups/:groupId/players | Active players in a Group |

This first slice is intentionally read-only. Browser persistence remains localStorage until write API, migration/import, authentication, and server-side authorization are ready. SQL values use bind parameters.


## 8. Worker API write baseline

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/groups | Create Group in D1 |
| POST | /api/groups/:groupId/players | Create Player and Group link atomically |

The write baseline exists for repository/API integration work but is **not yet wired to the browser UI**. Until LINE Login and server-side Group authorization are implemented, Production UI remains on localStorage and does not call these write endpoints. IDs/timestamps are supplied by the application layer to preserve the existing domain contract. Duplicate/constraint failures return HTTP 409.


## 9. Session and Game write baseline

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/groups/:groupId/sessions | Create active Session + initial participant segment |
| POST | /api/sessions/:sessionId/games | Add a game result to an active Session |
| PATCH | /api/sessions/:sessionId | Update memo/status/end time |
| POST | /api/sessions/:sessionId/cancel | Cancel active Session only when it has zero Games; requires expectedVersion |

Worker-side validation protects basic invariants (3/4 unique participants, active group membership, integer game points totaling zero, active Session on game creation). The browser UI remains localStorage-backed until authentication/authorization is enforced.


## 10. Session details and API client baseline

`PATCH /api/sessions/:sessionId` now replaces participant notes and chip results together with Session metadata. Chip counts must be integers totaling zero. The Worker uses a D1 batch so the aggregate update is submitted as one grouped operation.

`WorkerApiClient` is the browser-side HTTP boundary. It maps non-2xx responses and network failures to the existing `Result<AppError>` convention. It is deliberately not composed into `createBrowserServices` yet; localStorage remains active until authentication and server-side authorization are available.


## 11. API repository adapter baseline

`ApiGroupRepository` and `ApiPlayerRepository` implement the existing application repository ports over `WorkerApiClient`. Supported operations map only to endpoints already implemented; unsupported Player lookup/update operations fail explicitly rather than silently falling back to localStorage. These adapters are not yet composed into the browser runtime.


## 12. LINE Login token/session flow

The Worker completes the LINE Login v2.1 authorization-code flow server-side. The callback exchanges the authorization code for an ID token, verifies the ID token with LINE using the original nonce and Channel ID, upserts the LINE external identity/User in D1, and issues a 24-hour HttpOnly/Secure/SameSite=Lax application session cookie.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /api/auth/line/start | Start LINE authorization with state + nonce |
| GET | /api/auth/line/callback | Exchange code, verify ID token, upsert User, issue app session |
| GET | /api/auth/me | Return current authenticated User |
| POST | /api/auth/logout | Clear application session |

All mutation APIs now require a valid application session. Group-level Admin/Member authorization remains the next enforcement layer. `LINE_CHANNEL_ID` is non-secret configuration. `LINE_CHANNEL_SECRET` and `AUTH_SESSION_SECRET` must be Cloudflare Worker secrets and must never be committed or captured in screenshots.


### Empty Session cancellation contract
`POST /api/sessions/:sessionId/cancel` accepts `expectedVersion` and is available to authenticated Members of the owning Group.
The Worker rejects finalized Sessions, Sessions with one or more Games, stale versions, and cross-Group access.
This endpoint is distinct from administrative `DELETE /api/sessions/:sessionId`, whose System Admin / Group Admin authorization remains unchanged.
