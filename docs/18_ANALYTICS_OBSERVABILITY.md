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

| Item | Phase 1 |
| --- | --- |
| Cloudflare Web Analytics | TBD |
| Custom Analytics | N/A / TBD |
| Google Search Console | Search公開決定後 |
| Access Log | Cloudflare platform範囲 |
| Application Log | Client-side最小限 |
| Audit Log | N/A（server/authなし） |

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

Phase 2でRequest / Correlation IDを導入し、User向けerror codeと運用Logを結び付ける。

## 8. Production Evidence

Analytics採用時:
- Production受信
- Preview非送信
- internal test非送信
- smoke event区別
- Privacyとの一致
