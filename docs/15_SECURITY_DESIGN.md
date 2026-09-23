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
