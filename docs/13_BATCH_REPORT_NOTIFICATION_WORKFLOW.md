# 帳票 / Batch / Notification / Workflow設計

## 1. 方針
対象がない項目もN/Aとして明記し、設計漏れと区別する。

## 2. 帳票

Phase 1: N/A

将来採用時:
- RPT ID
- purpose
- output format
- layout
- source data
- sort/group
- timezone
- permission
- privacy
- test evidence

## 3. Batch

Phase 1: N/A

将来採用時:
- BAT ID
- trigger / schedule
- timezone
- input / output
- idempotency
- retry
- timeout
- concurrency
- error handling
- monitoring
- rerun procedure
- audit

## 4. Notification / System Mail

Phase 1: N/A

採用時:
- NOTIFY ID
- trigger
- recipient rule
- subject
- body template
- variable fields
- send timing
- retry
- duplicate prevention
- audit
- privacy

LINE等はMailと同じ通知設計原則へ統合する。

## 5. Business Workflow

Phase 1に申請/承認Workflowはない。

ただしSession等の業務状態遷移は `11_DATA_DESIGN.md` で扱う。

本格Workflow採用時:
- WF ID
- actor
- states
- transition
- approval route
- branch conditions
- reject / return / cancel
- notification
- permission
- SLA/SLO
- audit
