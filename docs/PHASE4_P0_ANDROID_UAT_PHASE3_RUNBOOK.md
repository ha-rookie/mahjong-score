# 三麻スコア｜Phase 3 Android Chrome UAT 独立環境構築Runbook（PR #358）

更新基準：2026-11-02。**事前設計のみ。実際のCloudflare Access/D1/Secrets/Worker/LINE変更・Migration・デプロイは一切未実施。**
対象固定：`ha-rookie/mahjong-score` Draft PR #358。Phase 3実行には段階ごとの明示承認が必要。本番/既存Preview/Performance D1、main、Production Worker、LINE設定、既存Secrets/vars、既存Previewに触らない。

## 0. 決定事項と現在の判定

- **ENV-01：NO-GO**。Phase 2の成果は独立UAT Worker設定、サーバー固定WebAuthn Origin/RP ID、UATビルド生成物検査と負ケーステストまで。
- Worker名：`mahjong-score-android-uat`。候補Host：`https://mahjong-score-android-uat.ha-rookie.workers.dev`。Originはこの完全一致、RP IDは `mahjong-score-android-uat.ha-rookie.workers.dev`。実際のCloudflareアカウントで当該Hostを発行可能かは**未確認**。実Hostが異なる場合は設定・テスト・CIをレビューし直し、URLを推測で運用しない。
- 専用構成：`wrangler.android-uat.jsonc`、`PASSKEY_ENV=android-uat`、`preview_urls=false`、`workers_dev=true`。本番は未設定 `PASSKEY_ENV` で従来RPを維持。クライアント由来Origin/Hostを信頼しない。
- D1：新規の **`mahjong-score-android-uat`** のみ。現状UUID `00000000-0000-4000-8000-000000000000` は仮値であり、deploy gateは必ず拒否。既存Remote D1を再利用しない。
- 認証：UAT専用 `AUTH_SESSION_SECRET`（新規強乱数、保管先はSecrets）。本番LINE Channel ID/Secret、既存Session Secret、実個人/成績データは複製禁止。UATではLINE正常系をスコープ外（別のテスト用LINE Channelと新規承認がある場合だけ追加）。
- データ：純粋な架空ID/架空外部LINE subject、架空Group/Player/Session/Game/Scoreとチップ。原本からのエクスポートやD1クローンは禁止。
- **先行してCloudflare AccessをテストHostに設定し、未認証ユーザーをブロック**することを構築順序の必須条件とする。アカウント全体や本番HostにはAccessポリシーを変更しない。
- PRに対する確認時HEAD `5e70ffc397b2cf3467175afde4e855fabec77577`：App CI #41356412816 SUCCESS、Performance #41356412847 SUCCESS。文書追加による新HEADのCIは別途再確認すること。

## 1. 承認境界（すべて現在は未承認・未実行）

| Gate | 作業 | 必須の証拠 |
| --- | --- | --- |
| G0 Read-only | HEAD・CI・UAT Host候補・対象Cloudflare Account・protected D1一覧を照合 | SHA、CIリンク、Account、対象名、比較結果 |
| G1 Access作成 | UAT *単一* HostのSelf-hosted Cloudflare Accessアプリを先行設定。本人の明示承認が必要 | allow-list、未認証遮断、対象Host一致、他Worker無変更 |
| G2 D1作成 | 新規UAT Remote D1発行、UUIDをDraftのUAT専用設定だけに反映。本人の明示承認が必要 | 新規UUID、実Account ID、既存3系統D1との不一致 |
| G3 Migration/Seed | UAT新規D1へ0001〜0012適用と合成データ投入。別の明示承認が必要 | 適用履歴、FK/件数、検証スナップショット |
| G4 Worker/Secret | G1-G3の証跡後、UAT専用Worker配信とUAT専用Secret投入。別の明示承認が必要 | 実ホスト/RP、Worker SHA、Binding/Secrets（値は出さない）、Access遮断 |
| G5 Android実機 | Android Chromeで本番非接続を実測後、既存受入表ENV-01をGOへ | テスト用ID/成績前後照合、再ログイン、負ケース、証跡 |
| G6 Cleanup | 特定したUATだけを削除。別の明示承認が必要 | 削除対象ID一致、本番/Preview/Performance非対象 |

※ G0のread-only照合は今回GitHub側まで完了。Cloudflare実AccountやRemote D1の実状態・Accessの現状は未照合。これらを断定しない。

## 2. 作業前のローカル/CI側ゲート（将来実行する場合の例、今回実行禁止）

```bash
# Draft HEADだけをcheckoutして検証。mainへのmergeは禁止。
git rev-parse HEAD
npm ci --no-audit --no-fund
npm run lint
npm test
npm run test:android-uat:guard
npm run build:android-uat:ci
# 仮UUIDが残っている間は意図どおりFAILEDであることを確認する。
npm run check:android-uat:deploy-gate
```

UATビルドのCloudflare Vite Pluginは専用コンフィグから**生成された**Wrangler JSONを使う。通常の`npm run deploy`や無条件の`npx wrangler deploy`は実施しない。ビルド後、`dist`配下に生成された`wrangler.json`と`.wrangler/deploy/config.json`等の実行対象を再確認する。`wrangler.jsonc`本番設定や既存build生成物が選ばれていないことを検証してから、**UAT専用の明示承認済みコマンド**を確定する。

UAT設定・生成物のWorker名/vars/route/preview/D1 UUIDを検証する`scripts/uat-artifact-policy.mjs`は現在、sourceとgeneratedおよびリポジトリ内のproduction/performance設定を照合する。**Cloudflare上で実際にどのD1 UUIDが存在しどのAccountに紐付くかは検証しない**ため、G2で実Cloudflare側の照合も必須。

## 3. UATホスト/Cloudflare Access（G1承認後のみ）

1. Zero Trustが利用可能か、実Accountの`workers.dev`サブドメインが`ha-rookie`かを管理画面で確認する。Host候補を勝手に現在稼働中と見なさない。
2. Zero Trust > Access > Applicationsで **Self-hosted application** を作成。対象ドメインは`mahjong-score-android-uat.ha-rookie.workers.dev` **完全一致のみ**。本番Hostやアカウント全体の設定変更禁止。
3. Allowは明示指定したテスト担当者のメールアドレスのみ（ドメイン一括許可・Everyone Bypass禁止）。可能なら短いセッション期限とMFA・端末条件を採用。
4. 入口は画面パスも`/api/*`も同じAccess保護下にする。未認証でアプリのHTMLやパスキーAPIに達しないことを検証する。Access認証後にWorkerの既存アプリ認証も必要（AccessだけではSystem Adminにならない）。
5. UAT workerを配信する前にAccess設定・遮断を確認し、公開時間帯を作らない。Host不存在で確認できない項目はデプロイ直後の最優先チェックとする。未認証で到達できるならWorkerを停止し、招待・復旧操作に進まない。

公式：https://developers.cloudflare.com/workers/configuration/cloudflare-access/

## 4. 独立Remote D1発行・Migraton（G2/G3承認後のみ）

本節のコマンドは**今は実行しない**。D1の作成や`--remote`付き実行はCloudflareリソースを変更する。

```bash
# G2承認後、Cloudflare Accountと対象名を照合した作業者だけが実行
npx wrangler d1 create mahjong-score-android-uat
# 発行UUIDを wrangler.android-uat.jsonc の database_id にだけ反映
# 本番/既存Preview/Performance D1 UUIDとの完全不一致を人手でも検証
npm run build:android-uat:ci
npm run check:android-uat:deploy-gate

# G3承認後、DB名・UUID・Accountを照合し、UATに限って実行
npx wrangler d1 migrations list mahjong-score-android-uat --config wrangler.android-uat.jsonc --remote
npx wrangler d1 migrations apply mahjong-score-android-uat --config wrangler.android-uat.jsonc --remote
# 任意のローカル承認済み合成Seedファイルが完成した場合に限る
# npx wrangler d1 execute mahjong-score-android-uat --config wrangler.android-uat.jsonc --remote --file=./uat/approved-synthetic-seed.sql
```

1. 新UUIDは`wrangler.jsonc`のproduction ID/preview ID、`wrangler.performance.jsonc`のperformance IDおよび実アカウント一覧の既存D1 IDと**全件不一致**。同名DBが既存である場合、新規だと決めつけず停止。
2. 専用Configの`DB` Bindingが唯一のD1、`preview_database_id`なし、`previews.d1_databases`なし、`routes`なし。デプロイ生成物も同じUUID。誤接続時は即STOP。
3. 空の新規D1に、リポジトリの`migrations/0001_*.sql`〜`0012_*.sql`を順序通り適用。適用前に`migrations list`、適用後に履歴・テーブル・index・FKを読み取り確認。**本番DBのバックアップ/復元を種データに使用しない**。
4. Migrationの実行時は未承認の`wrangler.jsonc`既定設定や`npm run db:migrate:prod`を使用しない。特に`--remote`とConfig/DB名は必ず対で指定。

公式：https://developers.cloudflare.com/workers/wrangler/commands/d1/

## 5. 合成Seed設計・初期System Adminの課題（G3の追加前提）

必要な架空データ（全て専用UAT D1のみ、実際のUser/LINE subject/対局データは絶対にコピーしない）：

| テストID | 準備 | 検査 |
| --- | --- | --- |
| `G-UAT-A` | 架空Group、P-new/old/第三者のPlayer、group_memberships | 同一Group/PlayerのID保存 |
| `U-UAT-ADMIN` | `users.system_role='admin'` の架空System Admin | 管理者発行権限 |
| `P-UAT-NEW` | `group_players.user_id IS NULL`、過去成績あり | 7日招待→新Userへ紐付け |
| `U-UAT-OLD` と `P-UAT-OLD` | 同じUser IDにgroup_playersを紐付け、`external_identities`に**架空**LINE subject | 24時間復旧→同一Userにパスキー追加 |
| `U-UAT-MEMBER` | `system_role='user'`、一般member | 復旧URL発行403 |
| `G-UAT-B` | U-UAT-OLDの別Group Membership | 他Groupの権限保持 |
| `S-UAT-1`、`GAME-UAT-1` | finalized session、participant segment、game_results、chip_results | 前後の点数・順位・チップ一致 |

Seedは最新Migrationの実スキーマに合わせて生成し、固定ID、外部識別子、点数、順位、チップをmanifestで宣言する。PK/FK/UNIQUEに違反しないこと、3人・必要に応じ4人対局の集計APIが期待値と一致することをローカルSQLiteで検証してからRemote UATに適用する。

**未解決の運用ゲート：初期管理者認証**。既存コードのユーザー向けパスキー招待はSystem/Group Admin発行が前提で、既存User復旧は`system_role='user'`だけを対象とする。つまり、UATの最初のSystem AdminをLINEなしでログインさせる一般向け操作は現時点で存在しない。既存のE2Eテストでは架空Adminの認証済み署名セッションをローカルに発行している。

推奨する最小構成は、UAT専用に架空AdminをSeedし、そのUAT専用`AUTH_SESSION_SECRET`で**短命の`mahjong_session`署名Cookie**を生成するレビュー済みオフラインテストハーネスで、Access認証済みの隔離された管理者用ブラウザプロファイルだけに設定する方法。Cookieは`Secure; HttpOnly; SameSite=Lax`で、実User/Secret/Cookie文字列をリポジトリ・CIログ・Issue・スクリーンショットに残さない。発行時の認証・有効期限・`auth_version`、終了時の破棄とAdmin無効化まで監査する。**ハーネス未実装・未レビューのため、G3/G5開始条件は現状未充足**。本番に一時的なAdminエンドポイントを追加する案は採用しない。

## 6. UAT専用SecretとWorker配信（G4承認後のみ）

- `AUTH_SESSION_SECRET`は本番から複製せずUAT用に新規に生成（最低32バイト相当の暗号論的強乱数）。一時ファイル・履歴・標準出力へ値を露出させない。ダッシュボードまたはUAT名を明示するWrangler Secret管理手段を使用。
- **注意**：Cloudflareの`wrangler secret put`はWorkerの新Versionを作成・即時デプロイするため、単なる保存操作ではない。専用Worker名・アクセス制御・デプロイ順を確定し、G4承認後だけ実施。Sourceの`vars`にSecret値を記述しない。
- Cloudflare Vite Pluginはビルド後のgenerated Wrangler構成をデプロイに用いる。必ず最新Draft SHAのUATビルドのみを対象に、生成物・Account・Worker名・D1 ID・RP/Originを再照合。誤って本番`npm run deploy`を呼び出さない。
- LINE本番のID/SecretやCallback URLを変更・流用しない。LINE正常系は今回除外。
- 配信直後は **未認証Access拒否**、認証済みApp HTML/APIへの到達、`/api/auth/me`未ログイン401、UATにしか書込みされないことを確認。Workerの配信SHAを記録し、必ず本番/Preview Workerのデプロイ履歴・D1バインディングに差分がないことを確認。
- Secret/Accessは別アカウント内の手作業設定も含むため、GitHub Actions成功だけで正しさを宣言しない。

公式：https://developers.cloudflare.com/workers/wrangler/commands/workers/

## 7. 受入前証跡・負ケース・STOP

- Android最新版Chrome、画面ロック・パスキープロバイダ利用可、LINE/メールアプリ内ブラウザを利用しない。HostはUATであることをChromeアドレスバーで目視。
- G1-G4すべてGOで初めてAndroid実機の`PHASE4_P0_ANDROID_CHROME_ACCEPTANCE.md` A/B/C/D受入を実行。
- 初回招待7日・一度限り、既存User復旧24時間・一度限り、Challenge2分、キャンセル、expired/replay、誤Origin/RP ID、権限不足403、不一致409、旧成績不変を検証。
- before/afterは `users`、`external_identities`、`group_players`、`group_memberships`、`sessions`、`games`、`game_results`、`chip_results`、認証/Grant関連テーブルの許容差分を明記。ユーザー名一致だけでは合格しない。
- WebAuthn公開鍵/秘密鍵、Credential ID、Cookie、招待/復旧token、APIレスポンス全文、実ユーザー情報を公開Issue/CIへ貼らない。URLのquery文字列は必ずマスク。ログはレスポンスコード・操作種別・マスク済み相関IDだけ。
- **即STOP**：本番/既存Preview/Performanceへの通信・書込み、HostやRP ID不一致、Accessを経由しないUAT到達、想定外のD1 UUID、Admin不正認証、別User IDへ復旧、成績差異、Secret漏えい、想定外の新Worker/Route。
- ロールバックは**UAT専用Worker/D1/Secrets/Accessのみに限定**し、対象IDを突合したうえで別途承認。既存Remote D1や実端末の本番Credential・localStorageは削除しない。

## 8. 最終判定表（現在の実施状況）

| 項目 | 状態 |
| --- | --- |
| Draft HEAD 5e70ffc のApp/Performance CI | PASS（本Runbook追加前） |
| UAT config・RP/Origin・生成物Guard | 実装済み |
| Access実Account/許可者/Host照合 | 未実施 |
| UAT Remote D1発行 | 未実施 |
| UAT専用Secret投入 | 未実施 |
| 合成Seed/初期Adminハーネス | 未実装・要レビュー |
| UAT Migration/Worker deploy | 未実施 |
| Android Chrome実機 | 未実施 |
| 本番・既存Preview・main・既存Remote D1/LINEへの変更 | **実施しない** |

**Phase 3構築設計＝確定（条件付き）／リモート実行＝未承認／ENV-01＝NO-GO**。
