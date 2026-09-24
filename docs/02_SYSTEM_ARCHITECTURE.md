# System Architecture

## 1. 文書目的

この文書は、ユーザー・Cloudflare・GitHub・データストア等を含む「システム全体の構成」の正本とする。

## 2. Architecture Goals

- ARCH-001: React UI / Application / Repository / Worker API / D1の責務を分離する
- ARCH-002: Phase 2 runtimeはCloudflare Worker API + D1をsource of truthとする
- ARCH-003: Public RepositoryへSecret値を保存しない
- ARCH-004: GitHub Actionsでlint/test/build/D1 migration検証後、WranglerからCloudflare WorkersへDeployする
- ARCH-005: AuthenticationはLINE Login、AuthorizationはApplication側のSystem Admin / Group Admin / Memberで強制する
- ARCH-006: Preview D1とProduction D1を分離し、migration/recovery rehearsalでProductionを触らない
- ARCH-007: PWAはPhase 3以降へDeferredし、offline write/syncは独立設計とする

## 3. System Context

```text
User / Smartphone Browser
      |
      v
React SPA
      |
      +---- LINE Login ----> LINE OAuth / OpenID Connect
      |
      v
Application / Repository abstraction
      |
      v
Cloudflare Worker API
      |
      +---- Authorization (System Admin / Group Admin / Member)
      |
      v
Cloudflare D1

GitHub
  |
  v
GitHub Actions
  |- lint / test / build
  |- D1 migration validation
  |- Production deploy
  `- Production Security Headers smoke
      |
      v
Cloudflare Workers + Static Assets
```

Phase 2の麻雀DataはD1がsource of truth。legacy localStorageは移行前data / rollback evidenceとして残る場合があるが、D1 modeでは通常runtime persistenceとして使用しない。

## 4. Deployment Architecture

| ID | Component | Platform | Responsibility | Production | Preview / CI |
| --- | --- | --- | --- | --- | --- |
| ARCH-010 | Frontend | React + Vite | UI / client-side state | Yes | Build / test |
| ARCH-011 | Static delivery | Cloudflare Workers Static Assets | SPA配信 / Security Headers | Yes | Build artifact validation |
| ARCH-012 | Server/API | Cloudflare Worker | Auth callback / API / authorization / audit | Yes | TypeScript build |
| ARCH-013 | Data Store | Cloudflare D1 | Group/User/Player/Session/Game data | Production D1 | Separate Preview D1 |
| ARCH-014 | Identity Provider | LINE Login | OAuth 2.0 / OIDC identity | Yes | Provider integration |
| ARCH-015 | Recovery | D1 Time Travel | point-in-time recovery | Human-controlled | Preview rehearsal |

### Environment Separation

- Production D1とPreview D1は別database ID
- Pull Request CIはPreview D1 migrationを適用してschema compatibilityを確認
- main merge後のみProduction migration / Worker deployを実行
- D1 recovery rehearsalはPreview専用で、Production IDと一致した場合scriptが停止する
- Production SecretはCloudflare Worker Secret / GitHub Actions Secretsで管理
- Public RepositoryへSecret値をcommitしない

## 5. Runtime Data Flow

```text
User operation
  -> React UI
  -> Application / domain logic
  -> API Repository
  -> Worker API
  -> Authentication / Authorization
  -> D1 transaction / query
  -> API response
  -> UI state refresh
```

Active Sessionは複数端末利用を前提とし、手動refreshでSession / Game / Chip / Memoの最新状態を再取得できる。Session / Game update/deleteはversionを送信し、stale updateは409で拒否する。

## 6. Build / Deploy Data Flow

```text
Issue branch
  -> Pull Request
  -> GitHub Actions
       -> npm install
       -> lint
       -> build
  -> Human review
  -> Merge to main
  -> GitHub Actions
       -> lint
       -> build
       -> wrangler deploy
  -> Cloudflare Workers + Static Assets
```

## 7. External Dependencies

| ID | Service | Purpose | Runtime Dependency | Auth | Failure Behavior |
| --- | --- | --- | --- | --- | --- |
| IF-001 | Cloudflare Workers | SPA hosting / Worker API | Yes | Runtimeはapplication session | 配信/API利用不可 |
| IF-002 | Cloudflare D1 | application data | Yes | Worker binding | read/write不可 |
| IF-003 | LINE Login | User authentication | Login時 | OAuth/OIDC | 新規login不可。既存session有効中はAPI利用可能 |
| IF-004 | GitHub Actions | CI / Deploy | No | Repository Secrets | Deploy/CI不可。稼働中Productionには直ちに影響しない |

## 8. Trust Boundaries / Security

- Browserへ出してよい情報: API応答として許可されたGroup / Player / Session / Game等
- Browserへ出してはいけない情報: LINE Channel Secret、application session signing secret、Cloudflare API Token
- Authentication: LINE Login + HttpOnly / Secure / SameSite=Lax application session cookie
- Authorization: Worker APIがresourceのGroup ownership / Membership / roleをserver-sideで検証
- System Admin: 全Groupの管理操作
- Group Admin: 対象Groupの招待管理と管理者許可操作
- Member: 通常の記録・参照操作
- Invitation token: D1にはSHA-256 hashのみ保存。raw tokenは発行時のみ返却
- SQL: D1 parameterized query / bind
- Security Headers: Static AssetsへCSP/HSTS等を付与しProduction smokeで検証
- Audit: auth/authz failureと重要操作をstructured logへ記録

## 9. Availability / Failure Strategy

| Failure | User-visible behavior | Fallback | Logging/Detection |
| --- | --- | --- | --- |
| Cloudflare配信障害 | Webアプリへアクセスできない | なし | Cloudflare / Actions |
| localStorage unavailable | 保存できない旨を明示 | JSON export等を後続実装 | Client error |
| 保存データ破損 | 正常値として扱わない | Backup importを後続実装 | Client validation |

## 10. Observability

- Deployment history: GitHub Actions / Cloudflare
- Worker Audit Log: JSON structured log
- request correlation: CF-Ray優先、ない場合UUID
- auth failure / authorization failure / important administrative operationを記録
- Secret / token / Cookie / request body / Memo本文 /不要なPIIをLogへ出さない
- Cloudflare Web Analytics / Custom Analyticsは別途TBD

## 11. Performance / Cost

- SPAの初期表示を軽量に保つ
- Static AssetsをCloudflare Edgeから配信する
- GitHub Public Repositoryのstandard hosted runnerを利用する
- Phase 1では有料APIを利用しない

## 12. Architecture Decisions

- Hosting: Cloudflare Workers + Static Assets
- API: Cloudflare Worker
- Persistence: Cloudflare D1
- Authentication: LINE Login
- Authorization: System Admin / Group Admin / Member
- A## 12.5 Phase 2 Cloudflare Environment Gate

Phase 2の環境分離は実装済み。

- Production Workerは `mahjong-score`
- Production D1 / Preview D1は別database
- PR CIではPreview D1 migrationを検証
- main merge後のみProduction D1 migrationとWorker deployを実行
- Security Headersはmain deploy後にProduction responseを自動検証
- Preview recovery rehearsalはProduction DB IDと同一なら停止
- Cloudflare AccessはApplicationのSystem Admin / Group Admin / Member認証を代替しない

## 13. 未決事項

- TBD-ARCH-001: Preview Workerを常時公開する運用が必要か
- TBD-ARCH-002: Resolved: PWAはPhase 3以降へDeferred（Issue #160）
- TBD-ARCH-003: Analytics採用


## 14. Phase 2 LINE Login foundation

Authentication uses LINE Login v2.1 web login (OAuth 2.0 authorization code + OpenID Connect). The Worker owns the callback and all secrets. Browser code never receives the LINE Channel Secret. Initial scopes are `profile openid`; email is not requested.

Routes:
- `GET /api/auth/line/start`: creates random state/nonce, stores state server-side in D1, redirects to LINE authorization
- `GET /api/auth/line/callback`: validates state/nonce, exchanges code, verifies ID token, upserts User/ExternalIdentity and issues application session
- `GET /api/auth/me`: returns authenticated User and Memberships
- `POST /api/auth/logout`: clears application session

D1 migration 0002 introduces `users`, `external_identities`, and `group_memberships`. Player remains independently creatable and `players.user_id` remains nullable.

Required configuration: `LINE_CHANNEL_ID`. Required Worker Secrets: `LINE_CHANNEL_SECRET`, `AUTH_SESSION_SECRET`. Secret values must never be committed.


## 15. Initial administrator and authorization

Authorization is split into two scopes.

- System role: `users.system_role = admin | user`
- Group role: `group_memberships.role = group_admin | member`

System Admin is independent from Player linkage and Group membership. A System Admin can log in without being a Player, can operate every Group, create/manage Groups and Players, link Users to Players, and assign Group Admin/Member roles.

Group Admin is scoped to one Group. It can manage invitations and execute the Group-level administrative operations explicitly allowed by Worker API, including finalized/active Session deletion where implemented. It does not gain System Admin powers.

Member is a normal Group user. A User may be linked to at most one Player per Group through `group_players.user_id`, while remaining linkable to a different Player in another Group.

The first authenticated LINE User may claim System Admin only while no System Admin exists. This bootstrap updates only the User's system role; it does not create a Player link or Group membership. Existing Player linkage is therefore optional for System Admin.

System Admin management API foundation:
- `PATCH /api/admin/groups/:groupId/users/:userId`: create/update Group role and optionally link/unlink the User to a Player in that Group

Invitation URL issuance and invite-token consumption are implemented. Once an initial System Admin exists, an unrelated LINE-authenticated User with no valid invitation remains authenticated at the LINE layer but has no Group access.


## 16. Player invitation flow

Player invitation is a one-time, Group-scoped flow.

- System Admin and Group Admin can issue invitations
- An invitation targets one active Player in one Group
- The invite URL is valid for 7 days and can be used once
- Issuing a new invite for the same Player revokes the previous active invite
- The raw invite token is returned only at issuance time; D1 stores only a SHA-256 token hash
- LINE Login carries the invite token through the short-lived authentication cookie
- After LINE identity verification, the User is linked to the target Player and receives a `member` Group membership
- If the User is already a `group_admin`, accepting an invite does not downgrade that role
- A User already linked to another Player in the same Group cannot consume a conflicting invite
- A Player already linked to another User cannot be invited

Invitation management endpoints:
- `POST /api/groups/:groupId/players/:playerId/invitations`: issue a new one-time invite
- `GET /api/groups/:groupId/invitations`: list invitation history without raw tokens
- `DELETE /api/invitations/:invitationId`: revoke an unused invitation

The application header exposes invitation management to System Admin and Group Admin. Existing Phase 1 localStorage Groups/Players are copied only through the explicit System Admin migration endpoint; automatic background migrationは行わない。


## 17. LocalStorage to D1 migration and runtime switch

Existing Phase 1 data is migrated explicitly by the System Admin from the browser that still holds the localStorage dataset.

- The migration endpoint is `POST /api/admin/migrate-local-v1`
- Only System Admin may execute it
- The payload is validated against AppDataSchema v1 before D1 writes
- Migration is accepted only while D1 gameplay tables are empty
- Existing IDs are preserved for Groups, Players, Sessions, Segments and Games
- The localStorage source is not deleted after migration; it remains as a rollback/evidence copy
- After successful migration the browser sets `mahjong-score:persistence-mode=d1` and reloads
- Fresh authenticated devices without legacy local data activate D1 after successful LINE Login
- Before migration, the existing device remains on localStorage so the user never loses access to the Phase 1 dataset

D1 runtime repositories now support the operations required by the current UI: Session read/update/delete, Segment lookup/update, and Game read/create/update/delete.

While D1 is active, the Phase 1 JSON backup/restore buttons are hidden because they operate on the legacy localStorage snapshot. A dedicated D1 backup/restore flow is a separate follow-up.


## 18. iOS Home Screen web app and LINE Login state

iOS Home Screen web apps can open out-of-scope authentication URLs in a Safari view. The web app and that browser context must not depend on sharing a transient OAuth cookie.

For LINE Login, the application therefore stores the one-time OAuth state server-side in D1:

- the browser receives only a random `state` value
- D1 stores only a SHA-256 hash of that state, the OIDC nonce, optional invitation ID, expiry, and consumed timestamp
- the callback validates the returned `state` against D1 and atomically marks it consumed
- the state expires after 10 minutes and is single-use
- invitation context is carried by invitation ID in the server-side state record, not a browser cookie
- ID token nonce verification remains mandatory

This specifically avoids the previous `Invalid LINE Login state` failure observed when iOS `Open as Web App` caused the callback to execute in a browser context that did not share the transient `mahjong_line_auth` cookie.
