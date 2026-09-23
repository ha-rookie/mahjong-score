# 基盤設計

## 1. 目的
Hosting、Runtime、環境分離、Deploy、Secret、監視、Backup等のシステム基盤を定義する。

## 2. 現行構成

| ID | 項目 | Phase 1 | 将来 |
| --- | --- | --- | --- |
| BASE-001 | Frontend | React + TypeScript + Vite | 継続 |
| BASE-002 | Hosting | Cloudflare Workers + Static Assets | 継続 |
| BASE-003 | Deploy | GitHub Actions + Wrangler | 継続 |
| BASE-004 | Data | Browser localStorage | D1 |
| BASE-005 | Server API | なし | Cloudflare Worker API |
| BASE-006 | Auth | なし | Access → LINE Login等 |

System ContextとData Flowの正本は `02_SYSTEM_ARCHITECTURE.md` とする。

## 3. Environment

- ProductionとPreview/TestのSecret・Binding・Analyticsを分離する
- PreviewからProduction Dataへ書き込ませない
- Environment固有値はsourceへ直書きせず、公開設定値 / Secret / Bindingを区別する
- Phase 1はserver-side Data Storeなし

## 4. Secret / Configuration

Secret:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

原則:
- Secret値をRepository、Issue、PR、Log、Browser bundleへ出さない
- Production / PreviewのSecretを必要に応じて分離する
- Tokenは最小権限
- Secret rotationを想定する

公開設定値、Feature Flag、BindingはSecretと混同しない。

## 5. Deploy / Rollback

```text
Issue Branch
 -> PR
 -> lint / test / build
 -> Human approval
 -> main
 -> wrangler deploy
 -> Production smoke
 -> Human verification
```

Rollback:
- mainをforce updateしない
- 原則revert PR
- DB migration導入後はrollback可能性とforward-fixを事前設計する

## 6. Backup / Recovery

Phase 1:
- localStorage DataをJSON export/import可能にする
- importはschema validationを必須にする

Phase 2:
- D1 backup / restore方法
- migration rehearsal
- RTO / RPO
- restore verification

を別Issueで具体化する。

## 7. Time / Locale / Encoding

- timezone: Asia/Tokyoを基本候補
- server保存日時: UTCを基本候補、表示時にlocale変換
- date-only値とtimestampを区別する
- text encoding: UTF-8

確定値はData/API設計と整合させる。

## 8. Capacity / Cost

- Phase 1は有料APIを前提にしない
- GitHub / Cloudflareのquotaは定期的に実測する
- record件数、Log量、Analytics量、D1容量はPhase 2導入時にNFRとして数値化する

## 9. TBD

- BASE-TBD-001: Preview AppのCloudflare公開方式
- BASE-TBD-002: custom domain
- BASE-TBD-003: D1 backup / recovery target
