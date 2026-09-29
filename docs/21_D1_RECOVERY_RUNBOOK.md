# D1 Backup / Recovery Runbook

## 1. Purpose

Phase 2のD1障害・誤更新・誤削除・Migration failureに対して、Production dataを復旧できる手順を定義する。

## 2. Primary recovery mechanism

Cloudflare D1 Time TravelをPrimary backup / point-in-time recoveryとして採用する。

- Time TravelはD1 production backendで常時有効
- restore pointはminute単位で指定できる
- retentionはplan依存
  - Workers Free: 7 days
  - Workers Paid: 30 days
- restoreはdatabaseをin-placeで上書きするdestructive operation
- restore responseのprevious bookmarkを使ってrestore自体をundoできる

Cloudflare official references:
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/d1/wrangler-commands/
- https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/

## 3. Phase 2 targets

- RPO target: Time Travel retention内で1 minute
- RTO target: Humanがrestore判断してから60 minutes以内にdata integrity / application smokeまで完了
- Production restoreは自動実行しない
- Preview recovery rehearsalは自動化可能

RPO/RTOはservice guaranteeではなく、このProjectの運用目標。

## 4. Production restore guardrails

Production restore前に必ず以下を行う。

1. Incident impactを確認
2. latest healthy application commit / deploymentを確認
3. current Production bookmarkを取得してundo pointとして記録
4. restore target timestamp / bookmarkを二重確認
5. Humanがrestore実行を明示承認
6. Time Travel restoreを実行
7. schema / migration状態を確認
8. /api/health、Authentication、主要画面、対象dataをsmoke
9. Audit / Incident evidenceを記録
10. restore pointが誤っていた場合はprevious bookmarkまたは事前bookmarkで再restore

Production D1 IDをPreview rehearsal scriptへ渡してはならない。

## 5. Production bookmark / restore commands

Current bookmark:

```bash
npx wrangler d1 time-travel info DB --json
```

Timestampからbookmarkを確認:

```bash
npx wrangler d1 time-travel info DB --timestamp="2026-09-25T00:00:00Z" --json
```

Production restore:

```bash
npx wrangler d1 time-travel restore DB --bookmark="<confirmed-bookmark>"
```

restoreはdestructive operationのため、Incident対応時以外にProductionで試行しない。

## 6. Preview recovery rehearsal

Reusable command:

```bash
npm run db:recovery:preview
```

Scriptは次を自動実行する。

1. Preview / Production database IDが異なることをassert
2. Preview上の古いrehearsal probeを削除
3. baseline bookmarkをCloudflare Time Travel APIから取得
4. Previewへ一時probe table / markerを作成
5. probeが存在することを確認
6. baseline bookmarkへPreview D1をTime Travel restore
7. probe tableが消えていることを確認
8. failure途中でもtrapでbaseline restoreを試行

Production databaseは一切変更しない。

## 7. SQL export policy

Phase 2ではTime TravelをPrimary recovery mechanismとし、Production SQL exportをGitHub Actions artifactへ自動保存しない。

理由:
- repositoryはpublic
- backupにはPlayer / User / gameplay dataが含まれ得る
- GitHub artifactをlong-term data vaultとして扱わない
- Time Travel retentionを超える長期archiveが必要になった時点で、private storage（例: Cloudflare R2等）へのencrypted exportを別Issueで設計する

## 8. Migration recovery / preflight

Production D1へ実dataが入った後は、schema migration前に「戻れる点」を確認してから適用する。

通常のProduction workflowではmigration直前に次を実行し、GitHub Actions logへrecovery pointを残す。

```bash
npx wrangler d1 time-travel info DB --json
```

この取得が失敗した場合はProduction migrationへ進まない。

通常migrationの原則:
- Production適用済みmigration fileを書き換えない
- additive / non-destructive migrationをdefaultとする
- reset / recreate / cleanしない
- `DROP TABLE` / `DROP COLUMN` / `DELETE FROM` / data消失を伴うtable rebuildを通常deployに含めない
- fixture / seedでProduction実dataを置き換えない
- local existing-data regressionで代表data保持を確認してからProductionへ進む

Migration直後に問題が起きた場合:
- application code rollbackだけでschema compatibilityが戻るか確認
- data/schema rollbackが必要ならmigration前bookmarkへTime Travel restore
- restore後にmigration historyとschemaを確認
- Session / Game / Result / Chip / Memo / Group / User / Membership / Player linkの代表dataを確認
- History / Performance / AuthenticationのProduction smokeを通す

Migration failureそのものはD1 migration transaction rollbackを前提とするが、migration成功後のlogical defectはTime Travelで扱う。

### 8.1 Destructive migration exception

破壊的schema変更が不可避な場合は通常deployから分離し、以下をすべて満たす。

1. 別Issueへ目的・影響範囲・対象tableを記録
2. 旧schemaから新schemaへのcopy/backfill手順を用意
3. local/Previewでexisting-data migration testを実施
4. 適用前後の件数・整合性verification queryを定義
5. migration直前のProduction Time Travel recovery pointを確認
6. rollback / restore手順を確認
7. HumanがProduction適用を明示承認
8. 適用後に件数・整合性・主要画面を確認
9. EvidenceをIssueへ残す

Human approvalのないdestructive migrationはProductionへ適用しない。

## 9. Evidence

Recovery rehearsal evidenceはIssue / GitHub Actions run IDとして残す。

Production restoreを実施した場合は最低限:
- incident time
- restore target
- pre-restore bookmark
- resulting bookmark / previous bookmark
- operator / approval
- smoke result
- follow-up Issue

を残す。

Production migrationを実施した場合は最低限:
- migration file / PR
- pre-migration recovery point取得結果
- local migration guard / existing-data regression結果
- Production migration result
- post-migration smoke result

をEvidenceとして追跡する。

## 10. Phase 2 recovery rehearsal evidence

2026-09-24 / GitHub Actions run #36072191864:

- Preview D1 migrations: success
- baseline bookmark capture: success
- rehearsal probe creation / verification: success
- Time Travel restore to baseline bookmark: success
- post-restore probe absence verification: success
- Production D1: not modified

Evidence:
https://github.com/ha-rookie/mahjong-score/actions/runs/36072191864
