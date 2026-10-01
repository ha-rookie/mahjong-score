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

SQL values use bind parameters。

## 8. Worker API write baseline

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/groups | Create Group in D1 |
| POST | /api/groups/:groupId/players | Create Player and Group link atomically |

IDs/timestamps are supplied by the application layer to preserve the existing domain contract. Duplicate/constraint failures return HTTP 409.

## 9. Session and Game write contract

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/groups/:groupId/sessions | Create active Session + initial participant segment |
| POST | /api/sessions/:sessionId/games | Add a Game result to an active Session |
| GET | /api/games/:gameId | Read one Game |
| PUT | /api/games/:gameId | Correct one active-Session Game with optimistic locking |
| DELETE | /api/games/:gameId?version=N | Delete one active-Session Game with optimistic locking |
| PATCH | /api/sessions/:sessionId | Update active Session memo/status/end time/details |
| PATCH | /api/sessions/:sessionId/note | Update only Session Memo of a finalized Session |
| POST | /api/sessions/:sessionId/cancel | Cancel active Session only when it has zero Games; requires expectedVersion |

Worker-side validation protects 3/4 unique participants, ParticipantSegment一致, integer Game points totaling zero, limits, and active Session state.

Issue #299以降のGame writeでは、request bodyの`results`は従来どおり次のみを含む。

```json
{
  "results": [
    { "playerId": "player-id", "scorePoint": 42 }
  ]
}
```

`placement` / `isLast`はrequestから受け付けない。Workerがvalidated Score Pointから算出し、D1へ保存する。

```text
placement = 自分よりscorePointが高いPlayer数 + 1
is_last   = 自分のscorePointがGame内最小値なら1
```

Rules:
- 最高Score Pointは一意でなければならない
- 最高Score Point同点はHTTP 400 `invalid_game_first_place_tie`
- 下位同点は許可する
- 最下位同点は複数Playerを`is_last=1`にする
- PUT訂正時はResult置換と同時にplacement/is_lastを再計算・置換する
- existing `game_results.rank`はlegacy orderとして維持し、actual placementには使用しない

Issue #304以降、Game read payloadは保存済み`game_results.placement` / `is_last`をそれぞれ`placement` / `isLast`として返す。対象は`GET /api/sessions/:sessionId/games`と`GET /api/games/:gameId`。`isLast`はbooleanへ正規化する。Session Resultsの勝率はこの`placement`を正本として使い、Score Point最大値から順位を再推定しない。Performance集計は引き続きserver-sideでD1列を利用する。

## 10. Session details and API client baseline

`PATCH /api/sessions/:sessionId` replaces participant notes and chip results together with active Session metadata. Chip counts must be integers totaling zero. The Worker uses a D1 batch so the aggregate update is submitted as one grouped operation. `finalized` Session remains rejected by this broad update endpoint so it cannot be reopened or have Chip / Participant Memo changed through the active-session contract.

`PATCH /api/sessions/:sessionId/note` is a narrow finalized-Session memo-only contract.

Request:
```json
{
  "note": "optional string or null",
  "updatedAt": "ISO-8601 timestamp",
  "expectedVersion": 3
}
```

Rules:
- target Session must be `finalized`
- authenticated User must be System Admin or a Member / Group Admin of the owning Group
- `expectedVersion` is required and stale updates return HTTP 409 `stale_update`
- note length uses the same `SESSION_NOTE_MAX_LENGTH` limit as active Session memo
- update changes only `sessions.note`, `sessions.updated_at`, and increments `sessions.version`
- Game / Chip / Participant Memo / status / endedAt are not mutated
- memo content is not written to Audit Log

Response returns the new `version` and `updatedAt` so the browser can continue optimistic concurrency without an immediate full reload.

`WorkerApiClient` is the browser-side HTTP boundary. It maps non-2xx responses and network failures to the existing `Result<AppError>` convention.

## 11. Performance summary API

`GET /api/groups/:groupId/performance-summary` returns finalized-Session Player aggregates for the selected Group.

Query parameters:
- no period params: all-time
- `year=YYYY`: yearly
- `year=YYYY&month=MM`: monthly

Response item:

```json
{
  "playerId": "player-id",
  "sessionCount": 12,
  "gameCount": 72,
  "mahjongPointTotal": 406,
  "finalPointTotal": 631,
  "gameFirstPlaceCount": 28,
  "sessionFirstPlaceCount": 5
}
```

Semantics:
- `sessionCount`: finalized Session参加数
- `gameCount`: 対象期間のGame Result件数
- `mahjongPointTotal`: chipを含まないScore Point合計
- `finalPointTotal`: Sessionごとの`mahjongPointTotal + chipCount * chipRate`合計
- `gameFirstPlaceCount`: `game_results.placement = 1`件数
- `sessionFirstPlaceCount`: Session finalPoint最大だったSession件数。Session finalPoint同点は双方を1位として数える

UI derived values:
- 平均 = `mahjongPointTotal / gameCount`
- 半荘勝率 = `gameFirstPlaceCount / gameCount * 100`
- Session勝率 = `sessionFirstPlaceCount / sessionCount * 100`

平均/率そのものはAPI/D1へ保存しない。Performance summaryは1回のaggregate queryで返し、GameごとのN+1 readを行わない。

## 12. API repository adapter baseline

`ApiGroupRepository` and `ApiPlayerRepository` implement the existing application repository ports over `WorkerApiClient`. Supported operations map only to endpoints already implemented; unsupported Player lookup/update operations fail explicitly rather than silently falling back to localStorage.

## 13. LINE Login token/session flow

The Worker completes the LINE Login v2.1 authorization-code flow server-side. The callback exchanges the authorization code for an ID token, verifies the ID token with LINE using the original nonce and Channel ID, upserts the LINE external identity/User in D1, and issues an HttpOnly/Secure/SameSite=Lax application session cookie with an initial 24-hour lifetime.

Issue #301以降、application sessionはsliding expirationとする。`GET /api/auth/me`で有効なsessionを解決した時点でsigned payloadの残り有効時間が12時間以下なら、新しい`exp = now + 24h`を署名したsessionを発行し、Cookie `Max-Age=86400`も同時に更新する。残り12時間超ではCookieを再発行しない。Browserはprotected API操作の直前に最大1時間に1回だけ`/api/auth/me`をpreflightし、active use中のsessionを更新可能にする。24時間以上無操作ならsessionはexpiredし401になる。

Runtime中のprotected API 401は、Browser側でnetwork errorと区別して`mahjong:auth-expired`として扱う。App本体はunmount/initializationせず、再ログインDialogを重ねることで入力途中のScore / Chip / Session memoを保持する。再ログインは`GET /api/auth/line/start?response=json`でauthorization URLを取得して別WindowでLINE Loginを行い、元Windowが`GET /api/auth/me`成功を確認して復帰する。401を受けた元mutationは自動再送せず、Userが内容を確認して再実行する。

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /api/auth/line/start | Start LINE authorization with state + nonce |
| GET | /api/auth/line/callback | Exchange code, verify ID token, upsert User, issue app session |
| GET | /api/auth/me | Return current authenticated User |
| POST | /api/auth/logout | Clear application session |

All mutation APIs require a valid application session. `LINE_CHANNEL_ID` is non-secret configuration. `LINE_CHANNEL_SECRET` and `AUTH_SESSION_SECRET` must be Cloudflare Worker secrets and must never be committed or captured in screenshots.

### Empty Session cancellation contract
`POST /api/sessions/:sessionId/cancel` accepts `expectedVersion` and is available to authenticated Members of the owning Group.
The Worker rejects finalized Sessions, Sessions with one or more Games, stale versions, and cross-Group access.
This endpoint is distinct from administrative `DELETE /api/sessions/:sessionId`, whose System Admin / Group Admin authorization remains unchanged.

### PUT /api/games/:gameId - finalized Game correction
- active Sessionの既存Game更新仕様は維持する
- Sessionが`finalized`の場合はSystem Adminだけ更新可能とし、Member / Group Adminには403を返す
- `expectedVersion`によるoptimistic concurrencyを維持する
- Score Point合計0、参加者一致、値域、Game Tag validationを既存更新と共通化する
- 訂正後は`placement` / `is_last`を再計算し、GameResultとGame versionを同一更新単位で保存する
- Session versionも更新し、Session詳細の競合検知を維持する
- 監査ログ`finalized_game_corrected`にはuser、group、game、session識別情報とoutcomeを残し、Score値そのものは記録しない

## 14. Player performance detail API
`GET /api/groups/:groupId/players/:playerId/performance-detail` returns one Player's finalized-Session detail aggregate for the selected Group.

Query parameters:
- no period params: all-time
- `year=YYYY`: yearly
- `year=YYYY&month=MM`: monthly

Authorization / scope:
- authenticated User must have existing Group access
- `playerId` must be an active or historically linked Player of the target Group; cross-Group Player access returns not found/forbidden without leaking another Group's aggregate
- read-only; no Production data mutation

Response:
```json
{
  "performance": {
    "playerId": "player-id",
    "sessionCount": 12,
    "gameCount": 72,
    "mahjongPointTotal": 406,
    "chipCountTotal": 45,
    "chipPointTotal": 225,
    "finalPointTotal": 631,
    "placementTotal": 136,
    "firstPlaceCount": 28,
    "secondPlaceCount": 31,
    "thirdPlaceCount": 13,
    "fourthPlaceCount": 0,
    "lastPlaceCount": 13,
    "sessionFirstPlaceCount": 5
  }
}
```

Semantics:
- `placementTotal`: persisted `game_results.placement` sum; average placement = `placementTotal / gameCount`
- first/second/third/fourth counts: exact persisted `placement` values
- `lastPlaceCount`: persisted `game_results.is_last = 1` count, independent from max placement
- `chipCountTotal`: Session-unit `chip_results.chip_count` sum
- `chipPointTotal`: Session-unit `chip_count * sessions.chip_rate` sum
- `finalPointTotal = mahjongPointTotal + chipPointTotal`
- `sessionFirstPlaceCount`: same Session finalPoint winner semantics as Performance summary
- rate/average display values are derived by the UI and are not persisted
- one aggregate query is the default implementation; no per-Game/per-Session N+1 reads
- no D1 schema / migration change
