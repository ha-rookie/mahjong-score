# 三麻スコア｜Phase 4 P0 統合リリース候補（Issue #345）

2026-10-31時点の**リリース候補の唯一のレビュー対象**。本ドキュメントは、Draft #346→#354→#355→#356→#357の成果を**機能1組・移行1件・テスト群1組**として説明する。基準はmain `21b890c1ebd70fcc6069b64c84d3bf4c063603b3`（Production S1）。この統合ブランチは#356の最終HEAD `e31ca5f86f9f4e03726377b97f7b0e0e7acc1ad5`を親に持つ。

## 統合内容と重複排除

| 旧Draft | 成果 | 統合方針 |
| --- | --- | --- |
| #346 | D1で一度だけ消費するWebAuthn challenge | そのまま取り込み |
| #354 | LINEなしの未連携Playerへの招待・パスキー登録・次回ログイン | そのまま取り込み |
| #355 | 既存LINE Userへの管理者確認済みパスキー復旧 | そのまま取り込み |
| #356 | System Admin HTTP API→使い捨てリンク→実WebAuthn P-256→元Userのセッション/再ログイン→Group/Player/Scoreの**全旅程の実SQLite結合テスト** | **統合の親**として採用 |
| #357 | Fake D1による既存User復旧とP-256検証の追加重複テスト／偽Originを拒否する独自の負ケース | 重複するFake D1旅程は取り込まず、**偽Originを拒否しGrantもCredentialもUser/Player/Scoreも変わらない**という独自価値を#356の実SQLite旅程の中へ取り込む |

- 共通のP-256 WebAuthn用fixtureは`tests/support/passkey-test-authenticator.ts`だけを使用し、`tests/passkey-line-free-crypto.test.ts`にあった二重実装を削除。暗号検証をMock化していない。
- PR #357の「P-256登録→ログイン成功」重複テストファイルは追加せず、#356の実Worker+SQLite旅程で担保。#356の旅程には管理者のHTTP権限、Cookie、元のUser/Player/Group/LINE ID/ゲーム/成績の全行比較、使い捨てGrantとChallengeの再使用拒否が含まれる。
- 既存のLINEログイン経路は維持。認証セッションはLINEと同じ`authVersion`、追加されるDB migrationは**`migrations/0012_existing_user_passkey_recovery.sql`だけ**。S1の`passkey_credentials`と`auth_challenges`を再利用し、User/Player/Group/Game/Scoreテーブルの破壊的変更なし。
- 古い#347～#353（LINE再認証強制・別Preview環境）は**この候補に含まれない**。それらの別`0012`を一緒にmergeしてはならない。

## リリース前ゲート

1. **最新HEAD CI**：Lint/TypeScript/Build、既存LINE回帰、P-256暗号試験、実SQLite通し試験、Wrangler Local D1 Migration 0001～0012、既存Game/ScoreのMigration回帰、Performance CIのPASSを記録する。
2. **本番未変更**：本DraftへのpushはProductionにはデプロイせず、Remote D1 migrationも行わない。main SHAを再確認する。
3. **実機受入**：LINE利用者の従来ログイン、LINE不可の新規招待→パスキー登録→ログアウト→再ログイン、既存UserのSystem Admin発行→登録→元User/Group/Player/Score表示、Android Chrome／iPhone Safariで確認（まだ未実施）。
4. **別承認**：main merge時にはProduction Worker自動デプロイとMigration 0012適用があり得る。対象PRのHEAD/BASE/CI、既存成績・DBバックアップと適用順、既存LINEの受入、rollback手段を提示して**ユーザーの明示承認まで実行しない**。
5. **管理者確認**：既存User復旧で、管理者が本人をアプリ外で確認する必要がある。表示名だけの自動User再紐付けはしない。

## 変更差分と正本

- リリース候補はこのブランチからの**単一Draft PR（対main）**が正本。旧Draftはレビュー資料・履歴であり、個別mergeしない。
- **テストが成功しても現時点で本番稼働済みとは主張しない**。実Cloudflare Remote D1やスマートフォン実機は未検証。
- 正本：[Issue #345](https://github.com/ha-rookie/mahjong-score/issues/345)。

## 2026-11-14｜公開Challenge発行のD1書込み濫用対策
- `POST /api/auth/passkey/{login,invite,recovery}/options` のみを対象。Cloudflareが付ける `CF-Connecting-IP` がない・不正な場合は失敗として **Challengeを発行しない**。クライアントの `X-Forwarded-For` は使用しない。
- 5分固定窓で **接続元8回／アプリ全体40回**。SHA-256化した接続元キーと全体キーをD1の条件付きUPSERTで消費。上限到達後は読み取りのみで429・`Retry-After: 300`。並行要求も窓内の最大発行件数を超えないようSQLiteの更新条件で制限する。
- 新規の追加Migration `0013_passkey_public_budget.sql` でカウンタ表と保持期間のindexを作成。適用はローカルCIのみ。親の既存`0012`は変更しない。
- `auth_challenges` は **失効後24時間以上** 保持し、それより古いものを許可済みOptions要求で最大32件ずつ削除。`passkey_option_budgets` も窓開始から24時間以上経過していれば最大32件ずつ削除。両者とも対象がない場合DELETEは実行しない。Cron未設定のため、長期間無アクセス時には遅延削除となる。
- D1の新規Challenge書込み上限は分散IPでも40/5分（予算カウンタ自体には上限までD1書込みあり）。アクセス全体の負荷軽減には、**Cloudflareエッジのレート制限を別承認で追加する余地がある**。Secrets/vars/D1 Remote/Workersには未変更。
- **Stacked #361の扱い**：子PRに既存の`0013_passkey_line_stepup.sql`があるため、親の新`0013`を取り込む際、子のLINE Step-up Migrationを`0014`へ改番し、実SQLite CI/移行順を再検証する。子を親より先にmainマージしない。
