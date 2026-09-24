# Project Security Design

## 1. 目的
共通標準 `SECURITY_BASELINE.md` を参照し、このProjectで採用するSecurity境界・対策・実測方法を定義する。

## 2. Phase 1 Trust Boundary

```text
Public Internet
  -> Cloudflare Workers Static Assets
  -> Browser React App
  -> localStorage
```

Phase 1は認証なし。麻雀DataはBrowser内にのみ保存し、serverへ送信しない。

## 3. Phase 2+ Trust Boundary

```text
Browser
 -> Worker API
 -> Authorization
 -> Domain / Repository
 -> D1
```

Frontend表示制御をSecurity上の認可とみなさない。

Phase 2のAuthorization単位はSystem roleとGroup Membershipの組合せとする。Worker APIは対象resourceのgroupIdに対して、認証済みUserの権限をserver-sideで毎回確認する。

- System Admin: `users.system_role='admin'`
- Group Admin: `group_memberships.role='group_admin'`
- Member: `group_memberships.role='member'`

System Admin専用操作:
- Group作成
- User / Membership / Player link管理
- localStorage -> D1 migration等のsystem-wide管理操作

System Adminまたは対象GroupのGroup Adminに許可する操作:
- Player invitation発行/取消
- APIで明示的に許可したGroup管理操作（Session削除等）

Member許可操作:
- Session / Game / Chip / Session Memoの通常操作
- History / Performance参照

D1 Production recoveryはApplication UIのRoleではなく運用手順上のHuman承認を必要とする。

URLやrequest bodyのgroupId/userIdを信用せず、server側でresource ownership / membershipを解決する。

## 4. Threat Coverage

- SQL Injection: D1はparameterized query / bind
- XSS: React標準escapingを基本、`dangerouslySetInnerHTML` 原則禁止
- Sanitizing: context依存。validationとoutput encodingを分離
- CSRF: Cookie/session採用時に具体化
- CORS: allowlist
- IDOR/Broken Access Control: resource scopeをAPI側で確認
- Mass Assignment: accepted fields明示
- Open Redirect: destination allowlist
- Rate Limit / Abuse: Phase 2でAPI特性別に設定
- Information Disclosure: stack/SQL/Secret非返却
- Supply Chain: lockfile、dependency check
- Import: untrusted dataとしてschema validation
- Secret leakage: source/log/browser bundleへ出さない

## 5. Security Headers Contract

Phase 2ではCloudflare Workers Static Assets公式の `public/_headers` を利用し、browserへ配信するDocument/Static AssetへSecurity Headerを付与する。

| SEC ID | Header | Phase 2 Policy |
| --- | --- | --- |
| SEC-001 | Content-Security-Policy | `default-src 'self'` を基準。scriptはselfのみ、inline styleは現行React UIのstyle属性に限り許可、`frame-ancestors 'none'`、`object-src 'none'` |
| SEC-002 | Strict-Transport-Security | `max-age=31536000` |
| SEC-003 | X-Frame-Options / frame-ancestors | `DENY` / `frame-ancestors 'none'` |
| SEC-004 | X-Content-Type-Options | `nosniff` |
| SEC-005 | Referrer-Policy | `strict-origin-when-cross-origin` |
| SEC-006 | Permissions-Policy | camera / microphone / geolocation / payment / usb / accelerometer / gyroscope / magnetometer を拒否 |
| SEC-007 | X-Permitted-Cross-Domain-Policies | `none` |

現行CSP:
- script-src: self
- style-src: self + unsafe-inline（Reactのinline style使用のため）
- img-src: self + data
- font-src/connect-src/form-action/manifest-src/worker-src: self
- base-uri: self
- object-src/frame-ancestors: none
- upgrade-insecure-requests

`_headers` はWorker codeが直接生成するAPI responseには適用されない。Phase 2のSecurity Headers完了条件はbrowser Document/Static Asset境界とし、API側の共通Header middleware化は必要性に応じ後続Phaseで拡張する。

## 6. Verification

```text
Design
 -> public/_headers
 -> Vite buildでdist/client/_headers存在確認
 -> deploy
 -> GitHub ActionsからProduction rootへHEAD
 -> 必須Header assert
 -> external header diagnostic when required
```

Production:
`https://mahjong-score.ha-rookie.workers.dev/`

Repository上の設定値だけで完了扱いにせず、main deploy後のProduction response smokeをRelease Gateに含める。

## 7. Security Logging

Phase 2ではCloudflare WorkersのApplication LogへJSON構造化Audit Logを出力する。D1へ専用Audit Tableは追加しない。

記録対象:
- protected APIのauthentication failure
- authorization failure
- LINE Loginの主要failure / success
- system admin bootstrap
- Session削除
- Player/User unlink
- Invitation発行 / 取消
- Membership / Player link変更
- localStorage -> D1 migration等の管理操作

各Logは最低限:
- timestamp
- event
- requestId
- method
- path
- outcome
- internal userId（認証後のみ）
- 必要時のgroupId / resourceType / resourceId

を持つ。

requestIdはCloudflareの `CF-Ray` がrequestに存在する場合はそれを利用し、local/preview等ではUUIDへfallbackする。

Logへ出さない:
- LINE/OAuth token
- Invitation token
- Cookie
- Secret
- request body
- Session Memo等の自由記述
- displayName等の不要なPII

validation failureやrate/abuseの集約監視は、利用量と必要性を見ながら後続Phaseで拡張する。

## 8. Security Test Traceability

各SEC IDは `20_TEST_DESIGN.md` とIssue/PR evidenceへ接続する。


## 9. Player Invitation / Account Linking Security

- Invitation発行/取消はSystem Adminまたは対象GroupのGroup Adminのみ許可する
- 既存UserのMembership/Player link管理はSystem Adminのみ許可する
- clientから指定されたuserId/playerIdだけで紐付けを許可せず、Group scopeと重複をserver側で検証する
- 未ログインPlayerへの招待はsingle-use random tokenを使用する
- raw invitation tokenは発行Response/共有URL以外へ保存せず、D1にはSHA-256 hashのみ保存する
- invitation有効期限は7日
- 同一Playerへの再発行時は既存の未使用Invitationをrevokeする
- used_at / revoked_atで使用済み/取消を管理する
- Audit Logへraw invitation tokenを出さない


## 10. Phase 2 Authentication Design

### Baseline
- Authentication providerとApplication authorizationを分離する
- 外部providerのsubjectをUserの内部stable IDとして直接利用しない
- provider + subjectをExternalIdentityとしてUserへ紐付ける
- OAuth client secret等はWorker Secretとして保持し、browser bundle / public repositoryへ出さない
- callbackはWorker側で処理し、state / nonce等を検証する
- OAuth state / nonceはD1 `line_login_states` でserver-side管理し、stateはsingle-use / 10分でexpireする
- Application sessionはsigned HttpOnly / Secure / SameSite=Lax cookieを使用し、有効期限は24時間
- API authorizationは認証済みUser IDを起点にGroupMembershipをserver側で検証する

### Provider decision
初期Authentication providerはLINE Loginを採用する。Google Identityを初期provider候補とはしない。

LINE Login v2.1のauthorization code + OpenID Connectを使用する。scopeは `profile openid`。Worker callbackでtoken exchangeとID token verification（nonce含む）を行う。

### Invitation relation
Player invitationはAuthentication providerとは独立したApplication invitationとして扱う。招待受領者が認証完了した後、server側で招待対象Group/Playerと認証Userを検証して紐付ける。

### Authentication decisions
- TBD-AUTH-001: Resolved: 初期Authentication providerはLINE Login
- TBD-AUTH-002: Resolved: System AdminのMember管理画面でdisplayName / role / linked Playerを表示して紐付け管理する
- TBD-AUTH-003: Resolved: Invitation deliveryはURL共有
- TBD-AUTH-004: Resolved: Application sessionは24時間。refresh tokenによる自動延長はPhase 2で実装しない


## 11. Phase 2 Security Evidence

- Authentication / authorization / invitation: Production実装済み
- optimistic concurrency: #146 / PR #147
- structured audit log / request correlation: #154 / PR #155
- Security Headers: #156 / PR #157、main run #36071486621
- D1 recovery guardrails: #158 / PR #159、Preview rehearsal run #36072191864
- PWA: Phase 3以降へDeferred（#160）
