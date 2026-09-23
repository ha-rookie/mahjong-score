# 運用 / Release設計

## 1. 目的
Deploy後の確認、監視、障害対応、Backup/Restore、Rollbackを設計する。

## 2. Release Gate

```text
CI
 -> Human approval
 -> Merge
 -> Production deploy
 -> Production smoke
 -> Smartphone verification
 -> Design sync
 -> Issue close evidence
```

詳細は `RELEASE_CHECKLIST.md`。

## 3. Production Smoke

最低限:
- HTTP 200 / HTTPS
- stable application marker
- main相当
- major assets
- major flow
- Security Headers
- API response（導入時）
- intended index/noindex
- analytics receive/exclude（採用時）

## 4. Monitoring

Phase 1:
- GitHub Actions deploy history
- Cloudflare deployment status
- manual production verification

Phase 2+:
- API error rate
- latency
- auth/authz failure
- D1 failure
- backup/recovery status
- custom alert threshold

## 5. Incident / Recovery

Incident時に:
1. impact確認
2. latest healthy commit/deployment特定
3. rollback or forward-fix判断
4. data integrity確認
5. production smoke
6. evidence / lessons learned記録

## 6. Backup / Restore

Phase 1:
- user-triggered JSON export/import

Phase 2:
- D1 backup
- restore rehearsal
- RTO/RPO
- migration recovery

## 7. Post-release

- Search Consoleの後日index観測
- Analytics trend確認
- quota/cost確認
- known issue更新
- reusable lessonをTemplateへ昇格
