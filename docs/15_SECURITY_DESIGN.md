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

Phase 2のAuthorization単位はGroup Membershipとする。Worker APIは対象resourceのgroupIdに対して、認証済みUserが有効なMembershipを持つことを毎回確認する。Admin専用操作はさらにrole=`admin`を要求する。

Admin専用操作:
- Group管理・Group作成に関する管理操作
- Group Membership管理
- Backup / Restore

Member許可操作:
- Session / Game / Chip / Session Memoの通常操作
- History / Performance参照

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

Project固有値は実装Issueで確定する。

| SEC ID | Header | Policy |
| --- | --- | --- |
| SEC-001 | Content-Security-Policy | selfを基本。必要な外部originのみ許可 |
| SEC-002 | Strict-Transport-Security | HTTPS恒久運用を確認後設定 |
| SEC-003 | X-Frame-Options / frame-ancestors | 原則DENY |
| SEC-004 | X-Content-Type-Options | nosniff |
| SEC-005 | Referrer-Policy | 必要最小限 |
| SEC-006 | Permissions-Policy | 未使用sensor/camera/mic等を拒否 |
| SEC-007 | X-Permitted-Cross-Domain-Policies | none |

## 6. Verification

```text
Design
 -> config/static test
 -> deploy
 -> Production response smoke
 -> external header diagnostic when required
```

Repository上の設定値だけで完了扱いにしない。

## 7. Security Logging

Phase 2以降:
- auth failure
- authorization failure
- validation failure
- dangerous operation
- suspicious rate/abuse

を記録するが、Secret / password / unnecessary PIIを出さない。

## 8. Security Test Traceability

各SEC IDは `20_TEST_DESIGN.md` とIssue/PR evidenceへ接続する。


## 9. Player Invitation / Account Linking Security

- PlayerへのUser紐付け・招待発行はAdminのみ許可する
- 既存User紐付け時も対象GroupへのAdmin権限をAPI側で検証する
- clientから指定されたuserId/playerIdだけで紐付けを許可せず、Group scopeと重複をserver側で検証する
- 未ログインPlayerへの招待はsingle-use token等の本人確認可能な方式とし、tokenを監査Logや通常レスポンスへ露出しない
- 招待tokenの有効期限・再送・取消・使用済み無効化はAuthentication方式決定時に確定する


## 10. Phase 2 Authentication Design

### Baseline
- Authentication providerとApplication authorizationを分離する
- 外部providerのsubjectをUserの内部stable IDとして直接利用しない
- provider + subjectをExternalIdentityとしてUserへ紐付ける
- OAuth client secret等はWorker Secretとして保持し、browser bundle / public repositoryへ出さない
- callbackはWorker側で処理し、state / nonce等を検証する
- Application sessionはHttpOnly / Secure / SameSite cookieを基本候補とする
- API authorizationは認証済みUser IDを起点にGroupMembershipをserver側で検証する

### Provider candidate
初期providerの第一候補はGoogle Identity / OpenID Connectとする。Google accountはログイン本人確認のために利用し、Google Drive等の追加API scopeは要求しない方針とする。

ただしproviderの最終採用はHuman decisionとし、Google / LINE / その他を比較後に確定する。

### Invitation relation
Player invitationはAuthentication providerとは独立したApplication invitationとして扱う。招待受領者が認証完了した後、server側で招待対象Group/Playerと認証Userを検証して紐付ける。

### Human TBD
- TBD-AUTH-001: 初期Authentication provider（Google / LINE / その他）
- TBD-AUTH-002: 既存User検索・紐付け時にAdminへ見せる識別情報
- TBD-AUTH-003: Invitation delivery方式（URL共有 / email等）
- TBD-AUTH-004: Application session有効期限 / refresh policy
