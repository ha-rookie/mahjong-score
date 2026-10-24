# S2-B｜隔離Preview実機試験の前段階：リモート環境の確定と非書込ガード

> 2026-10-24｜Issue #345｜S2-B stacked Draft #352後続｜**Remote未接続・未配備・未実機試験**

## 1. GitHubで確認できた構成（事実と未確認を分離）

| 項目 | リポジトリで確認したこと | Remoteで未確認 |
| --- | --- | --- |
| 本番 | `wrangler.jsonc` に Production Worker `mahjong-score`、D1 `mahjong-score-prod` | Cloudflareの現在の実バインディング／有効Secrets |
| 既存Preview | `wrangler.jsonc` の `preview_database_id`と`previews.d1_databases`は同じ**別UUID**の`mahjong-score-preview`を指定。手動 `preview-d1-migrate.yml` が存在 | 現在の行数、使われ方、バックアップ、実バインディング、Preview Worker URL |
| Performance | `wrangler.performance.jsonc` に`mahjong-score-performance` Workerと別UUIDのD1。手動`performance-worker-deploy.yml`が存在 | 現在のWorker稼働／実データ |
| LINE | 現行の`wrangler.jsonc`とPerformance設定のLINE Channel IDは**同じ本番チャネル** | 独立したLINEテストチャネルの存在、登録済みcallback URL、Secrets |
| S2-B | Draft #346～#352でAPI・UI・Preview用Origin/RPID解決コード、機能フラグは未設定/OFF | Android/iPhoneでの実LINE/WebAuthnと同じUserに紐付く登録 |

**判断**：既存Preview D1が別UUIDであることは確認できる。しかし、既存Previewを空の使い捨て検証環境とはみなせない。PerformanceはProduction LINE Channelを参照するため、独立LINE/WebAuthn試験へ流用しない。Cloudflare/GitHubのSecrets/LINE Developersの設定は、GitHubの一般的なリポジトリ読取APIからは確認できない。Remoteの実在や分離を断定しない。

## 2. 今回作成した非実行／非配備資材

- `wrangler.passkey-isolated.example.jsonc`：Worker名 `mahjong-score-passkey-s2b-isolated`、Originの**想定文字列**、`DB`とLINEテストChannelの**未入力プレースホルダー**。値が未入力なので**配備できない例**。URLの実在を意味しない
- `scripts/s2b-isolated-preview-preflight.mjs`：**Node.js標準ライブラリのみの静的検査**。専用manifestを読み込み、`wrangler.jsonc`と`wrangler.performance.jsonc`の**本番・既存Preview・Performanceの全3 UUID**からDBを厳密に隔離する。既定OFF、別LINE Channel、専用Worker/RP/Origin、Secretsをmanifestに置かないこと、その他不正な設定を拒否。**Cloudflare APIやCLIは一切呼び出さない**
- `tests/passkey-isolated-preflight.test.ts`：正常なダミーUUID/LINE Channelによる静的PASS、配備不能なexample、不正Worker/Origin/Channel、3既存DB IDの混入、機能Flag ON、追加D1、Secretsの文字列混入、偽ルートなどでFAILを検証
- `.gitignore`：実運用時の`wrangler.passkey-isolated.jsonc`を追跡対象から外し、偶発的なcommitを防ぐ。Cloudflare/LINE/セッション秘密値はGitHub Issue／Actionsログ／Notion／公開URLに書かない

**検査例（将来の管理者専用。ユーザーにはCLI操作を求めない）**

```sh
node scripts/s2b-isolated-preview-preflight.mjs --config wrangler.passkey-isolated.jsonc
```

この静的PASSは **Production事故防止の必要条件であって、実Cloudflare分離の十分条件ではない**。

## 3. Remoteの読取だけで先に確定すべき項目

1. Cloudflare accountに実在するWorker・D1の一覧とUUID、今のWorker実バインディング（**read-only**）。特にPreviewとPerformanceのデータ/用途を確認。専用実験D1新設が必要か検討
2. LINE Developersの**独立テスト用Login Channel**、登録済みcallbackの可否と検証端末の利用者情報を、権限のあるUIで確認。Production ChannelのSecretsはテストに流用しない
3. Worker `mahjong-score-passkey-s2b-isolated`用の**実際に利用可能なホスト名**とD1 UUIDが確定してから、exampleのプレースホルダーを置き換える。推測したURL/UUIDを正本として扱わない
4. `AUTH_SESSION_SECRET`、`LINE_CHANNEL_SECRET` は**独立したPreview-only値**をCloudflareに注入する計画を用意。APIトークンの範囲と作成・削除権限を確認。秘密値をCI表示しない
5. 独立D1へのadd-only 0011/0012などのMigration適用、ダミーUser/Group/Playerの用意、復旧/全削除方法を含む**具体的なリソース一覧**と実行前検査の計画を作る
6. 本物のLINE `prompt=login` / verified `auth_time/amr`、同ブラウザCookie、Android ChromeとiPhone Safariのパスキー登録→Credentialが**同一テストUser**に保存されることを受入。実データ/本番の成績は読み書きしない

## 4. Human Gate / 中止条件

- 今回の権限はGitHub開発ブランチへの静的資材追加とCIのみ。**mainへのmerge・本番/Preview/Performance Remote D1書込・Worker deploy・Secrets/vars・LINE設定変更はしていない**
- 本番mainにmergeするとProduction workflowがMigration・Worker deployを自動実行する。stacked Draft #346～#352と本PRを、個別/一括いずれでも無承認でmergeしない
- 実Cloudflareで必要なリソース名/UUID、独立LINE callback、権限、変更内容、復旧方法、影響を提示した後で、別途実環境作成の明示Human承認を得る
- ID不一致・本番DB紐付けの疑い・本番LINE Subject/Secretsの混在・現行データコピー必要性・本人確認省略の要求が出た場合はSTOP

### 参照

[Issue #345](https://github.com/ha-rookie/mahjong-score/issues/345)／[PR #352](https://github.com/ha-rookie/mahjong-score/pull/352)／[Cloudflare Wranglerの別config指定](https://developers.cloudflare.com/workers/wrangler/commands/workers/)／[Cloudflare D1 config](https://developers.cloudflare.com/workers/wrangler/configuration/)。
