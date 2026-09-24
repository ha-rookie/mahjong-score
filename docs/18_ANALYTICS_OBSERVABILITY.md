# Analytics / Observability設計

## 1. 目的
利用分析、運用観測、Log、Auditを混同せずに設計する。

## 2. 分類

```text
Google Search Console
  -> search discovery / crawl / index / query

Cloudflare Web Analytics
  -> traffic / referrer / device / web performance

Custom Analytics
  -> application operation events

Access / Application / Audit Log
  -> operation / failure / accountability
```

## 3. Current Decision

| Item | Current |
| --- | --- |
| Cloudflare Web Analytics | TBD |
| Custom Analytics | N/A / TBD |
| Google Search Console | Search公開決定後 |
| Access Log | Cloudflare platform範囲 |
| Application Log | Worker consoleの構造化Logを採用 |
| Audit Log | Phase 2: auth/authz failureと重要操作をJSONで記録 |

## 4. Analytics Design Contract

採用時に必ず定義:
- analysis purpose
- event ID/name
- payload schema
- allowed data
- prohibited data
- PII
- production host gate
- Preview exclusion
- internal test exclusion
- retention
- quota/cost
- privacy text
- failure isolation

Analytics障害でCore機能を失敗させない。

## 5. Logging

Access Log:
- request/correlation ID
- timestamp
- route/method
- status
- latency
- actor identifier only when justified

Application Log:
- validation failure
- dependency failure
- internal error
- state transition where useful

Audit Log:
- who
- when
- what resource
- operation
- success/failure
- minimal change context

## 6. Sensitive Data

原則Logへ出さない:
- token / secret / password
- unnecessary PII
- full request body
- full memo content
- raw backup data

## 7. Correlation

Phase 2でRequest / Correlation IDを導入する。

- Workerはrequest headerの `CF-Ray` を優先してrequestIdとして利用する
- `CF-Ray` がないlocal/previewではUUIDへfallbackする
- 同一requestに起因するAudit Logは同じrequestIdで検索できる
- token / Cookie / request bodyはcorrelation keyとして利用しない

## 8. Production Evidence

Analytics採用時:
- Production受信
- Preview非送信
- internal test非送信
- smoke event区別
- Privacyとの一致


## 9. Phase 2 Observability Status

Phase 2で実装済み:
- protected APIのauthentication failureをstructured audit logへ記録
- authorization failureをstructured audit logへ記録
- LINE Login主要failure/successを記録
- Session削除、Invitation、unlink、Membership変更、Admin bootstrap、migration等の重要操作を記録
- requestIdはCF-Ray優先、fallbackはUUID
- Secret / token / Cookie / request body / Memo本文 / displayName等の不要なPIIは記録しない

Implementation: `src/worker/audit.ts`
Evidence: #154 / PR #155

未導入:
- business KPI向けCustom Analytics
- Cloudflare Web Analyticsを使った利用分析
- error rate / latencyの自動alert threshold

これらはPhase 2完了条件とは分離する。
