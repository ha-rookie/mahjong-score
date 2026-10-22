# Phase 4 S1｜Auth version / Credential schema の実装・Release Gate（#343）

> Status: Draft S1 branch only / **Not approved for main merge or Production deployment**
> Scope: database schema + LINE session generation guard + regression tests. **No Passkey login API or credential revocation API yet.**

## 変更差分

- `migrations/0011_phase4_auth_foundation.sql`: `users.auth_version INTEGER NOT NULL DEFAULT 0`, passkey_credentials, auth_challenges。元のProduction用Migration 0001〜0010を編集しない。
- `src/worker/auth/line-login.ts`: 有効な署名Cookieには認証世代 `authVersion` が必要で、共通 `resolveSession` でUserがD1に存在し、`users.auth_version` と一致していることを確認する。
- 認証世代が違う場合、署名自体が正しくても全保護API入口で拒否する。UserがDBにない場合も拒否。D1問い合わせ不能時はFail Closed（公開APIにアクセスを許さない）。
- LINE OAuth callbackが新規発行するCookie、/api/auth/me のsliding renewalはその時点のDB世代を使う。LINE非招待ログイン／招待／state・nonce挙動は維持。
- Passkeyの保存schemaは用意するが、**既存LINE subjectの移行やPasskey機能・UIへの接続はしない**。方式失効API/同一トランザクションでのauthVersion増分はS3実装まで未提供。S1のschemaだけでは認証手段0件時の自動拒否を保証しない。

## Production rollout STOP（個別Human Gateが必要）

1. **DB Migration先行**。本番D1のRecovery Point、実DB binding対象、プレビュー/本番DBの分離を確認。Rollback計画はadditive SQLでも必須。
2. **旧セッションの維持方針を確定**。従来Cookieは`{userId,exp}`でauthVersionがない。本PRのコードは環境変数 `AUTH_LEGACY_SESSION_ACCEPT_UNTIL`（Unix epoch seconds）**未設定時には旧Cookieを拒否**する。旧ログインの一斉切断を避ける場合、リリース時刻から最大1 Session TTL (24h) の期限だけを**別途承認のCloudflare設定で指定**する。期限が過ぎれば旧形式は拒否し、新形式へrefreshしたCookieだけ継続可。世代が1以上のUserの旧Cookieは期限内でも常に拒否。
3. **古いWorkerへのRollback**は新形式Cookieの`authVersion`追加フィールドを旧コードが無視して署名検証可能なため、認証失効のゲートが消える。**認証方式失効機能の本番開始後は無条件Rollbackしてはいけない**。Rollout時点では失効APIをまだ公開しない。
4. **セッション失効は認証判定の次リクエストから有効**。既に認可済みの同時実行リクエストを戻す保証はない。Version増分とCredential無効化の同一D1トランザクションは後続Sliceの受入条件。
5. `users.auth_version`の更新を他APIに自動追加しない。旧LINEログインを単純なCredential0件判定で拒否しない（LINEはexternal_identitiesで管理）。
6. Passkey初回招待の原子的なUser＋Credential＋Player＋Membership登録や、未ログイン状態のdiscoverable Credential IDからのUser解決は**S2**。現S1で実現したと扱わない。
7. **本PRとCIの成功は実際のデプロイ許可ではない**。S0 Previewの一時Mapを本番認証へ流用しない。

## 2026-10-21 15時台｜専門家レビュー結果・Migration適用履歴の訂正

### Production Migration状態（確定ログと未確認を分離）

- `scripts/migration-safety-policy.mjs` が従来0001〜0009で止まっていたのは **管理台帳の取り込み漏れ**。2026-10-03 Production Workflow [Run #37107283293](https://github.com/ha-rookie/mahjong-score/actions/runs/37107283293) は `Apply D1 migrations to Production database`=SUCCESS、実行ログは **`✅ No migrations to apply!`** と記録。同runでProduction D1 recovery point取得、Worker deploy/binding/security header検証もSUCCESS。
- 0010ファイルは2026-09-30にmainへ取り込み済み。よって**2026-10-03の時点では0010までProduction適用済みだったという強い履歴根拠**がある。いま現在のRemote D1に読み取り専用コマンドを実行したわけではないため現況は未確認と明記する。
- PR #344に0010の正本Git blob SHA `3c1323e949185c85d13a558a53c46e92204e7bce` をimmutable台帳へ追加（0001〜0010を既存適用済みとして保護）。**以後のCIのfuture migrationは0011のみ**。
- 台帳同期に伴い、既存データ回帰テストのfixtureを「0010適用済みSchema」に更新。Game placement/is_lastの実データ形状を維持して検証し、以前の「0010前にfixture投入してからBackfill」という誤った時点前提を解消。
- Production本番適用前の最後の真偽確認は認証済みWranglerで `npx wrangler d1 migrations list DB --remote` を**読み取り専用**実行する。Previewは別コマンド `npx wrangler d1 migrations list DB --remote --preview`。**`apply` や `execute` は実行しない**。現ChatGPT接続にはCloudflare認証済みの直接Readツールがないため、正確な現在のRemote結果は未取得。

### セキュリティ／LINE後方互換レビュー修正

- `resolveSession` に渡るHMAC署名済みCookieのJSONが `null` / 配列のときにも、未処理TypeErrorで500にならずinvalid_payload相当の401。これはテスト用正当署名の異常値で確認。
- `AUTH_LEGACY_SESSION_ACCEPT_UNTIL` の上限をコード上も **現在から最大24h以内**に制限。未設定・期限切れ・遠過ぎる設定は旧Cookieを拒否。
- **旧Cookieは`/api/auth/me`へのアクセス時に残TTLにかかわらずauthVersion付きへ即時交換**。従来の12h sliding更新だけでは移行期間中の旧Cookieを変換できないケースを解消。
- 現在の共通認証判定はDB lookupが不能な場合は守る側でエラーとし、Cookie署名だけでUserを通さない。認証サービスの運用上のHTTP 503化・障害時UXは次の検証項目。
- 新規CI [Run #39557087754](https://github.com/ha-rookie/mahjong-score/actions/runs/39557087754): 154 tests PASS、Migration immutability 10件、Future Migration 0011のみ、隔離Local D1の既存データ保持とSchema guard PASS。

### リリースのSTOPは維持

- リモートD1の現在の適用状況／Recovery Pointの更新確認、24h以内のCookie移行期限値、過去成績バックアップ、Production Smoke、Rollback条件は**引き続きHumanによる事前審査**。
- PR #344はDraft。S2/S3のPasskey処理、失効API、招待原子性、iOS実機は未実装／未達。
## 回帰・確認事項

- S1 Session テスト：version一致許可、version増分による複数Cookie失効、旧Cookie期限内/外、DB User不存在、slidingでversion付きCookie発行。
- 既存LINE callback、state、招待、認証エラー／401 UX、Group認可のテスト。
- ローカルD1検証：既存User・LINE Identity・Membership・Player・Session・Game・Resultデータ不変、既存User.auth_version=0、passkey_credentials/ auth_challenges の生成、失効済みCredential IDの再割当を UNIQUE 拒否、Challenge purpose制限。
- D1競合時UPDATE 0件のbatch部分コミットはまだ**再現と本番用Abort方式の採用が未実施**。S2の招待原子性実装着手の前提GateとしてIssue #343/#335に維持。
- CIはテスト実行結果をIssueとPRへ記録し、機械CIと端末Human受入を混同しない。

## 正本の置き場所

- S1の実装受入・STOP：Issue #343
- Phase 4全体受入：Issue #335
- S0実機WebAuthn証跡：Issue #337
- Phase 4提案詳細設計／ADR：PR #336（Proposed, 未マージ）
- 本PR：S1の実装差分（Draft、mainとProductionへ未反映）
- Notion：三麻スコア基本設計の現在地

## 2026-10-22｜S1認証障害のHTTP 503化とProduction Preflight

### S1 Draft修正／動作範囲

- 認証DBのUser/auth_version照合時にD1読取が失敗したら、保護APIと`/api/auth/me`、管理者初期設定入口は **503 + `auth_service_unavailable` + `Cache-Control: no-store` + `Retry-After: 30`** を返す。Cookieの`Max-Age=0`での削除はしない。認証障害の監査イベントを記録する（DB例外そのもの、Cookie、Tokenを記録しない）。
- 401（失効／期限切れ）と503（一時的な認証ストア障害）を別として、ブラウザの認証状態を障害だけで消さない。`AuthStatus`は再確認ボタンで明示的に再試行できる。入力途中のMutationは自動再送しない。
- 回帰テストは署名Cookieが正常でもD1接続が失敗する状態を作り、保護API、`/api/auth/me`、管理者初期設定入口が403/401ではなく503、`set-cookie`なし、`retry-after`と固定エラーコードを返すことを検証。WorkerApiClientは503を`retryable=true`とし「セッション期限切れ」の案内を出さない。
- この変更は**認証判定時の障害**を扱う。認可後の他テーブル読取・書込失敗、外部LINE API障害を全て503に統一する保証はない。サービス全体のerror handler拡張は別スコープ。
- App CI Run #39641213305 / HEAD `4894b47e374aff75c37eac94ca393857f8588c07`：**155 PASS / 0 FAIL**、Lint、Build、Local D1 Migration、既存Data不変回帰検査SUCCESS。以後変更した場合は最終HEADの再検証が必要。

### Production Preflight Checklist（**未実施**、当日は値を記録して別承認）

1. [ ] Cloudflareに認証済みの権限で、対象repoの`wrangler.jsonc`の**Production DB binding**と操作対象を照合。Preview DBと混同しない。認証済み操作手段が用意できない場合、Remote確認は**未確認**のままSTOP。
2. [ ] 最新のMigrationファイルを持つ作業ブランチから **read-only** `npx wrangler d1 migrations list DB --remote` を実行し、Productionの未適用候補が**0011のみ**か確認（2026-10-03のRun #37107283293は0010適用の履歴根拠だが現時点の証明ではない）。Previewの確認は別の `npx wrangler d1 migrations list DB --remote --preview`。いずれも`apply`/`execute`は事前承認なしに実行しない。
3. [ ] `wrangler.jsonc`は現在`vars.LINE_CHANNEL_ID`を持つが**`AUTH_LEGACY_SESSION_ACCEPT_UNTIL`を宣言していない**。Cloudflare公式によれば、Dashboardにのみ保存した通常のWorker環境変数は`wrangler deploy`で上書きされ得る。Secretsは別挙動。**Dashboardで設定するだけでは安全な切替を保証できない。**
4. [ ] Cookie互換を保つ場合はHumanが本番リリース時刻を確定し、その時刻から24時間以内の**Unix秒による終了時刻**を決定。コード側でも24時間超の期限を拒否する。値をいつ・どの構成正本へ・どの環境に設定するか、`keep_vars`利用の要否と既存LINE_CHANNEL_ID等への影響を別レビューで決定。次回deployの際に変数が失われないことを検証。**設定未確認のままmainをmergeしない。**
5. [ ] GitHub mainへのpushは`.github/workflows/deploy-production.yml`によって**Production D1 MigrationとWorker deployを自動実行し得る**。MigrationとWorkerの適用順、Recovery Point、Error Smoke、実LINEログイン・cookie移行・401/503切り分け、rollback（旧WorkerにはauthVersion検査がなくセッション失効保証を壊す）を事前に構成。通常のPRテスト成功だけで安全なmain pushとはしない。
6. [ ] Previewのリハーサルは**明示的に対象Preview D1とWorkerを別承認・別スコープ**で実施。PasskeyのS0試験workerは本番Credentialの永続保存にも利用しない。
7. [ ] 自動Rollback・再ログイン・大量の認証失敗を検知した際のSTOPを定義する。ログに`session`Cookieや`Credential ID`、LINE token、Challenge生値、招待Token全文を出さない。

### Evidence / Docs

- Cloudflare D1 migration commands（list = 未適用migrationの確認）: https://developers.cloudflare.com/d1/wrangler-commands/
- Wrangler配置構成と`keep_vars`（Dashboard varsの上書き防止）: https://developers.cloudflare.com/workers/wrangler/configuration/
- `wrangler deploy --keep-vars`等の方法は**今すぐ設定変更する案ではない**。HumanによるConfig/Security/デプロイの別承認で方針を決める。
- S1 Draft PRはこのチェックが完了するまでOpen/Draft維持。main・Production・Remote D1・Secretsへの操作はこのドキュメント更新では一切許可されない。


## 2026-10-22｜D1 read-only確認スクリプト（GitHub PR #344の付属ツール）

S1の本番migration状態を確認するため、`scripts/s1-d1-remote-preflight.mjs`を追加。**初期動作はdry-run（Cloudflareアクセスなし）**。認証済みWrangler環境でのみ、Operatorが`--run`を明示して`d1 migrations list`の2種類を順次実行する。script自体にMigration適用、任意SQL実行、Worker deploy、Secret変更、GitHub workflow dispatchは実装しない。

```bash
# 対象は必ずPR #344の最新HEADをcheckoutし、git statusで意図しない差分がないことを確認
git rev-parse HEAD

# これはオフラインの確認。Cloudflareには接続しない
node scripts/s1-d1-remote-preflight.mjs

# Cloudflare認証済みの作業環境で実行する場合のみ（読み取り専用）
node scripts/s1-d1-remote-preflight.mjs --run
```

- 対象DBは`wrangler.jsonc`の`DB`で、Production=`mahjong-score-prod`、Preview=`mahjong-score-preview`と別IDを検証してから実行する。
- `--run`時は対象branch名 `feat/issue-343-s1-auth-foundation` を照合し、trackedな未コミット変更がある場合はSTOP。PR最新HEADとの完全一致は**人間が`git rev-parse HEAD`とGitHub PR HEADを比較**して確かめる。
- Productionの**未適用ファイルが0011のみ**を期待。異なる場合（0010が出る・0011が出ない・ほかのMigrationが出る等）NO-GOとし、ログとD1実体を人間が照合する。Previewの結果も個別に保管し、Productionと混ぜない。
- `list`は**ローカルmigrationとの突合**であり、schema実体やUser/Player/Score整合性の全面保証ではない。Migration一覧が期待どおりでも、Recovery Point、旧Cookie期限vars、Smoke、Rollback、Human Merge＋本番Deploy Gateを別に通す。
- 成功/失敗にかかわらずCloudflare API Token・Secretsはログへ写さない。Remote実測が完了するまで「検証済み」とは記載しない。
- スクリプトdry-run/引数拒否の自動テストは`tests/s1-d1-remote-preflight.test.ts`。**自動CIでは`--run`を実行しない**ため、このテスト成功をRemote D1の直接確認と混同しない。
