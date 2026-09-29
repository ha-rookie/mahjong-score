# 運用 / Release設計

## 1. 目的
Deploy後の確認、監視、障害対応、Backup/Restore、Rollbackを設計する。

## 2. Release Gate

```text
PR CI (local D1 only)
 -> Human approval
 -> Merge
 -> Human-approved manual Production workflow_dispatch
 -> Production D1 migration / Worker deploy
 -> Production smoke
 -> Smartphone verification
 -> Design sync
 -> Issue close evidence
```

`main`へのMerge自体ではProduction D1 migration / Worker deployを自動実行しない。remote D1はaccount-wide quotaを消費するため、Production反映はD1利用可否を確認したうえでHumanが明示的に開始する。

詳細は `RELEASE_CHECKLIST.md`。

## 3. Production Smoke

最低限:
- HTTP 200 / HTTPS
- stable application marker
- manual deploy対象のmain commit相当
- major assets
- major flow
- Security Headers
  - manual Production workflow内でProduction rootをHEADし必須Headerを自動assert
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
- auth/authz failure（Worker structured audit log）
- important administrative operation（Worker structured audit log）
- request correlation（CF-Ray / UUID fallback）
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
- Primary recovery mechanismはCloudflare D1 Time Travel
- Time Travel retentionはplan依存（Workers Free: 7 days / Paid: 30 days）
- RPO target: retention内で1 minute
- RTO target: Humanのrestore判断後60 minutes以内にdata integrity / application smoke完了
- Production restoreはdestructive operationのため自動化しない
- restore前にcurrent bookmarkをundo pointとして記録する
- Preview DBでrecovery rehearsalを実施し、bookmark restoreが機能することを確認する
- Production SQL exportをGitHub Actions artifactへ自動保存しない
- migration成功後のlogical defectはTime Travelでrollbackする

詳細手順は `21_D1_RECOVERY_RUNBOOK.md` を正本とする。

### 6.1 Production D1 migration guardrail

Production D1は実利用データのSource of Truthであり、schema変更のためにreset / recreate / cleanしない。

通常のmigrationは次をdefault ruleとする。
- additive / non-destructiveな前進migration
- Productionへ適用済みのmigration fileはimmutable
- `CREATE TABLE` / `CREATE INDEX` / 既存dataと互換性のあるcolumn追加 / safe default / backfillを優先
- `DROP TABLE` / `DROP COLUMN` / `DELETE FROM` / data消失を伴うtable rebuildを通常migrationへ入れない
- Production deploy経路からfixture / seedで実dataを置換しない
- Production / Preview / Performance D1のdatabase IDを分離する

PR CIでは以下をProduction操作なしで確認する。
1. Production適用済みmigration fileが書き換えられていない
2. 新規migrationに代表的なdestructive SQL patternがない
3. Production deploy workflowにraw D1 execute / fixture投入がない
4. Production / Preview / Performance D1 IDが異なる
5. Production相当の既存Session / Game / Result / Chip / Memo / User / Membership / Player linkをlocal D1へ投入し、新規migration後も保持される
6. History / Performance相当queryがmigration後も成立する

Production migration直前にはD1 Time Travel recovery pointを取得し、migration失敗またはlogical defect時に戻れる点を確認する。

破壊的schema変更が不可避な場合は通常deployへ直接含めない。別Issueで影響範囲、copy/backfill、件数・整合性verification、rollback / Time Travel手順を定義し、local/Preview検証とHuman approval後に個別適用する。

### 6.2 Production D1 binding guardrail

Production Workerが参照するD1とmigration対象D1のずれを防ぐため、D1 bindingはschema migrationとは別に検証する。

Production反映前:
1. `wrangler.jsonc` のtop-level `database_id`をintended Production D1とする
2. `preview_database_id`および`previews.d1_databases`はProductionと異なるPreview D1とする
3. Vite build後の `dist/mahjong_score/wrangler.json` を機械検査し、生成されたProduction / Preview bindingがsource設定と一致することを確認する
4. ProductionとPreviewが同じdatabase IDになった場合はdeploy前にfailする

Production deploy後:
1. `wrangler deployments status` から100% activeなWorker versionを取得する
2. `wrangler versions view <version>` のversion metadataから実際のD1 binding `DB`を取得する
3. active WorkerのD1 IDがintended Production D1と一致することを自動assertする
4. Preview D1へbindされていた場合はProduction verificationをfailする

Deploy時のconsole表示だけをruntime bindingの正本とはしない。CLI表示とversion metadataが食い違う場合は、実際にactiveなWorker versionへ保存されたbinding metadataをruntime evidenceとして扱い、Production / Preview D1をread-onlyで確認してから接続先変更を判断する。

DB接続先の不一致が疑われても、実データ所在を確認する前にrepoint / reset / clean / seedを実行しない。

## 7. Post-release

- Search Consoleの後日index観測
- Analytics trend確認
- quota/cost確認
- known issue更新
- reusable lessonをTemplateへ昇格

## 8. Phase 2 Release / Recovery Evidence

Historical evidence:
- Production Security Headers: main run #36071486621
- D1 Preview recovery rehearsal: run #36072191864
- D1 recovery implementation merge: PR #159

Current release safety mode (2026-09-26):
- PR CIはlint / test / build / static Security Headers / **local D1 migration**まで
- PR更新・MergeではPreview / Production D1へ自動アクセスしない
- Production D1 migration / Worker deploy / Production Security Headers smokeは、`main`からのmanual `workflow_dispatch`時だけ実行する
- remote D1がquota-limitedまたは利用不能な場合はmanual Production workflowを開始しない
- latest `main`とlatest Productionは同一とは限らないため、Release判断ではdeploy対象commitを明示する

Phase 2のProduction restoreは通常Release手順では実行しない。Incident時のみ `21_D1_RECOVERY_RUNBOOK.md` に従い、Humanがrestore targetとundo bookmarkを確認して実施する。
