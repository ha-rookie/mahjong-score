# 三麻スコア｜P0 LINE不要の招待→パスキー登録→パスキーログイン

2026-10-24｜Issue #345｜**Draft PR #354**｜main/Production/Remote D1変更なし

## ユーザー目的

LINEでログインできない知り合いを**既存の三麻スコア**へ参加させる。これまでのLINEログインは使い続けられ、既存のUser/Player/Group/対局/Scoreを壊さない。LINE再認証・別のPreview Worker構築は参加者側の必須条件にしない。

## 今回実装した使い方

1. 管理者は従来のメンバー管理画面で、**既存グループの未連携Player**用に7日間・一度限りの招待URLを発行する。URLは`/?invite=<token>`となり、LINE／パスキーどちらでも参加できる。従来のLINE直リンク`/api/auth/line/start?invite=<token>`は変更せず利用可能
2. 招待を受けた本人が「パスキーで参加（初回登録）」を選ぶ。**LINEアカウント／LINE再認証は不要**。招待の有効期限・未使用・対象Group/Playerが未連携であることを検証し、WebAuthnのChallenge・RP/origin/UV・公開鍵を検証する
3. 新規Userを作成し、**元から存在するGroup/Playerに同じIDのままリンクする**。使い捨てInvitationとCredentialの保存までをD1の同一トランザクション（`db.batch`）で処理する。最後のCredential INSERTにCHECK（`sign_count>=0`）を利用した失敗時rollbackガードを設け、Update=0による部分成功を避ける。既存のScoresには触れない
4. 登録成功時に**既存LINEログインと完全に同じ`authVersion`付きセッションCookie**を発行する。ログイン済みのApp/Group/Session/Score APIは変更しない
5. 次回以降、招待URLやLINEがなくても「パスキーでログイン」からdiscoverable credentialを選び、保存済みCredential IDをServer側でUserへ解決してWebAuthn署名/UV/Challenge/Counterを検証し、同じUserへログインする

## 検証・証拠

- `tests/passkey-line-free-contract.test.ts`：LINEなしの匿名登録、未連携Player、失効/使用済み拒否、ログイン`allowCredentials:[]`、Origin/METHODと不正応答、既存Scoreを操作しない
- `tests/passkey-line-free-crypto.test.ts`：**テスト用に本物のP-256鍵を生成**し、WebAuthn登録データのCBOR/COSEを合成、`@simplewebauthn/server@14.0.3`に実際の公開鍵/署名を検証させる。初回登録→同じUserのパスキーログイン→Challenge再利用拒否、同じPlayerと既存Scoreを維持
- `tests/passkey-line-free-d1.test.ts`：Wrangler隔離**Local D1**にグループ・既存Player・過去の対局結果をシード。Credentialの無権限INSERTで既存`sign_count` CHECK違反を確認し、正常登録のUser/GroupMembership/Invitation/Credential関係とScoreの前後一致を確認。Production D1へは触れない
- `migrations/0011_phase4_auth_foundation.sql`はすでに本番S1で適用済み。今回追加Migrationなし。既存LINEのSession発行ロジックを共通利用
- 最終HEAD/CIはPRの最新コメントを正本とする。テストはMock D1＋隔離Local D1であり、**LINEが使えない実ユーザーの実機登録はまだ行っていない**

## まだ終わっていないこと

- **元のLINE Userにすでにリンク済みのPlayerがLINEにログインできなくなったケース**：管理者確認のうえ**同じUser IDに**パスキーを登録する復旧導線は別途必要。単なる表示名一致、旧リンク切断、新Userへの無断付け替えは禁止。現状の一般招待は未連携Playerのみ
- Android Chrome／iPhone Safariでの本物の登録・パスキーログイン、招待URLの取り回し・PWA表示、管理者による実User↔Playerの確認
- 失敗／競合時の**実Cloudflare D1での原子rollback**の受入検証。ローカルSQLガードとFake D1によるE2Eの合格を本番実機合格と混同しない
- 既存LINEログイン・招待管理・成績を手動で確認する本番前受入

## Human Gate

mainへのマージは本番Workerの自動デプロイに連動するため、**Draft PR #354 は絶対に無承認でmergeしない**。既存S2-A親Draft #346の変更を含むので、mergeの順序・差分・本番基準値を明示してから別途承認。Cloudflare/Remote D1/LINE Secret/varsは変更しない。#347～#353は目的と無関係の旧S2-B LINE再認証・Preview拡張を含むので、P0のmerge前提にしない。

**今回の完了条件はPRやテスト件数ではなく、LINEを使えない友人がパスキーだけで既存グループに参加・再訪問できること。**
