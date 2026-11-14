# Phase 4 P0 #345｜LINEにログインできない既存Userのパスキー復旧

> 2026-10-24｜Draft PR #355｜親Draft #354＋#346。main/Remote D1/Worker未変更。

## 実現すること

元のLINE Userに既に紐付いているPlayerがLINEにログインできなくなっても、**同じ既存User IDにパスキーを追加**する。Userを作り直さない、Playerを付け替えない、Group/Session/Game/Score/LINE連携を変更しない。管理者が本人の意思と対象User・Playerの一致を**アプリ外で確認**してから復旧リンクを発行する。

1. **システム管理者**だけが既存メンバー管理画面の「パスキー復旧」を使える。ボタンには確認ダイアログがあり、サーバー側でもsystem_role=admin、active Group/Playerに紐付く`expectedUserId`完全一致、対象Userが通常UserであることをD1で検証する。グループ管理者には他グループを保有するUser全体の権限を与えないため、発行権限を与えない。
2. 24時間・一度限りの復旧URL（`/?recover=<random>`）を発行。tokenはSHA-256で保存、同じUserの古い未使用復旧リンクは失効。別のPlayerやUserへのリンク変更を行わない。
3. 本人はLINE不要で`POST /api/auth/passkey/recovery/options`からWebAuthn登録を開始し、`register_user` challengeに**対象の既存User ID**を固定する。WebAuthn Credentialは端末の秘密鍵と本人確認を用い、サーバーがRP/Origin/challenge/public key/UVを検証する。
4. `/api/auth/passkey/recovery/verify`は、条件付き復旧Grant消費と**既存Userに対するCredential INSERTの2 SQL**をD1.batchの同じトランザクションとして実行。最後の`CASE WHEN changes()=1 ... ELSE -1 END`＋既存`sign_count>=0`CHECKで、期限切れ/二重使用/連携解除/競合なら例外とロールバック。元UserのLINE外部IDとScoreは不変。
5. 登録成功時は**従来のLINE認証と同じauthVersion付きセッションCookie**を発行し、次回から既にDraft #354にある「パスキーでログイン」を使う。

## 実装とデータ

- **新Migration** `0012_existing_user_passkey_recovery.sql`：User/Group/Player/created-byにFKを持つ追加テーブル`passkey_recovery_grants`。Userや既存テーブルに削除/書換Migrationはなし。アクティブな未使用GrantはUserごとに1つ。
- **新認証処理** `src/worker/auth/passkey-recovery.ts`、招待/パスキーのGuest APIに2 Endpoint追加、Workerにシステム管理者限定の発行Endpoint追加、既存メンバー管理画面・Guest画面に操作を追加。LINE通常認証ルートやGame/Score APIには手を加えない。
- **前提** #354のLINE不要の新規招待→Passkey初回登録→次回ログインと、#346の一度限りWebAuthn Challenge。**#347～#353の不要なLINE再認証・別Previewインフラ作業を依存にしない**。
- **0012の衝突**：旧Draft #347系にも別内容の`0012`があり、それらは未マージ。#355は親#354にのみ重ねてあり、旧Draftを無条件で統合しない。mainへのMigration採番は承認前に差分確認。

## CI・検証と未完了

- `tests/passkey-recovery.test.ts`：既存User/Group/Player、管理者発行のみ、対象不一致/未連携拒否、復旧リンクの24時間期限、再発行で旧token無効、新User/Score変更なし、WebAuthn登録Optionsを確認。
- `tests/passkey-recovery-d1.test.ts`：**実Wrangler Local D1**でMigration 0012と既存User/Player/Group/過去Scoreをシードし、`changes()`＋CHECKの正常登録と二重消費拒否、Credentialユーザー紐付け、過去Score完全一致を確認。リモートD1書込は実施しない。
- 既存#354の`tests/passkey-line-free-crypto.test.ts`では実際のP-256鍵/署名による新規招待登録→同じUserのログイン検証済み。今回の既存User復旧は単体・ローカルD1において検証済みだが、**実ブラウザ/実端末のWebAuthn完走と管理者による本人確認は未実施**。
- 既存LINEユーザーのログイン、Group内の成績/履歴の読取、復旧後のパスキー再訪問をAndroid/iPhoneで確認し、本番移行前に別の明示的承認を得る。
- 機能未リリース。main最新SHA、CIリンク、変更対象のリソース、必要なD1 Migration、元データfingerprint/復旧点を含むHuman Gateなしにmainへmergeしない。GitHub Actionはmain pushでProduction Migration/Worker Deployが動く。

**ゴールは、LINEが使えない知り合いも、元のUser/Player/成績のままでログインできること。** セキュリティ・実験環境の拡張やテスト数を目的にしない。
