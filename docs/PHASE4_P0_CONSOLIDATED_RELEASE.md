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
