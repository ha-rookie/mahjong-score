# Android Chrome実機受入チェックリスト（Phase 4 P0 / Issue #345）

対象: 統合Draft PR #358。2026-11-01作成。**本書は受入準備であり、実機試験の実施報告ではない。**

## 開始判定：NO-GO（現在）

WebAuthnのserver-defined originは https://mahjong-score.ha-rookie.workers.dev 、RP IDは mahjong-score.ha-rookie.workers.dev に固定されている（src/worker/auth/passkey-line-free.ts）。復旧APIも同じ固定値を参照し、HTTP handlerはリクエストのOrigin完全一致を要求する。別のWorkers Preview URLを開くだけでは実機のパスキー登録は動作しない。

本番mainはまだP0未適用。本番URLで試験することを禁止する。wrangler.jsoncのデフォルトのDBは本番を指すため、無条件にwrangler deployしない。Production Worker、Production/Preview Remote D1、Secrets/vars、LINE Login設定に一切変更しない。

### 実施前の必須条件（別承認のゲート）
- [ ] **専用HTTPSホスト**と、そのホストで利用可能な**試験用WebAuthn RP ID/Origin**を、信頼できるサーバー設定として用意する。ブラウザOrigin値を認証設定として信用しない
- [ ] Productionと既存Previewのどちらからも切り離した**専用の試験用Worker + 専用D1**を指定し、worker名、D1 binding、Database IDが本番と異なることをレビューする。DB migrations 0001–0012を試験用D1に適用
- [ ] 専用AUTH_SESSION_SECRETなどの試験用設定を定義する。試験用LINE Channelが無ければLINE回帰はBLOCKEDとして扱い、本番LINE Channelに接続しない
- [ ] 実際のユーザーや本番Scoreをコピーせず、合成テストデータを作る: System Admin、未連携Player A、既存LINE連携User BとPlayer B、両Groupに過去のSession/Game/Score
- [ ] 隔離環境の作成・デプロイ自体をユーザーから別途承認してもらう。ここまでは**文書化のみ**で一切実施しない

## Androidの共通準備

- Android Chromeで試験用HTTPSホストを直接開く。LINEアプリ内ブラウザとPWAホーム画面アプリは使わない。Android/Chromeバージョン、使用パスキープロバイダー、画面ロック方式を記録
- PIN/生体認証とGoogleパスワードマネージャー等のパスキー保存先が使用できることを確認
- 管理者のブラウザセッションとゲストのブラウザ環境を分離。端末に過去の三麻スコアLocalStorageが残る環境を試験用に使わない。既存端末の保存データを消去しない
- 招待URL、復旧トークン、Cookie、Challenge、LINE識別子、実名をGitHub Issue、チャット、スクリーンショット、画面録画に貼らない
- 試験開始時、試験用D1からUser/Player/Group/Group Player link/Membership/Session/Game/Score/LINE外部IDの件数・紐付け・過去成績を読取専用で記録し、終了後の前後一致を比較。識別子は公表しない

## A. LINEなし初回招待：未連携Player

1. 管理者で隔離環境にログインし、メンバー管理で既存Player Aが「未連携」であることを確認。「招待URLを発行」を押す
2. URLは試験用ホストの /?invite=... 、有効期間は7日間・使い捨て。本人のみに限定共有する
3. ゲストのAndroid Chromeでリンクを開き、表示文言「パスキーで参加（初回登録）」を押す。LINEでログインのボタンを使わない
4. Androidのパスキー登録画面でPIN/生体認証を行う。サーバーのChallengeは120秒有効なので登録画面で長時間放置しない
5. 登録完了後、同じGroupとPlayer A、既存の過去セッション・成績が表示されることを確認
6. アカウントメニューから「ログアウト」→再び試験用ホストを開く→「パスキーでログイン」→登録したパスキーで認証。LINEなしで同じGroup・Player・過去成績が表示されること
7. 試験用DBで、既存Player IDとGroup IDは不変、新User作成が1件だけ、Player Aとのリンクが1件だけ、過去Game/Scoreは全行不変を確認
8. 消費済み招待リンクからの再登録が拒否され、User/Playerが重複生成されないことを確認

## B. 既存LINE連携Userの復旧：同じUser IDを維持

1. System Adminが**本人をアプリ外で確認した後**、既存User BとPlayer Bの正しい紐付けを確認。別のGroup Adminでは発行できないことも確認
2. System Adminが「パスキー復旧」を押し、対象Playerの確認ダイアログを承認。復旧URLは試験用ホストの /?recover=... で24時間有効・1回限り
3. 本人がAndroid Chromeで復旧リンクを開き、「元のアカウントにパスキーを登録」を押し、パスキーを作成。LINE画面へ遷移しない
4. ログイン済み画面で元のUser B、Group B、Player B、過去セッション・順位・点数・チップを確認
5. 「ログアウト」→同じ試験用ホストのトップ→「パスキーでログイン」→同じパスキーを選ぶ。元のUser Bとして認証されること
6. 試験用DBで、User/Player/Group/Membership/LINE外部ID/過去Game/Scoreは前後一致。Userの新規生成0件、Playerの新規生成0件。Credentialだけが元のUser Bへ追加され、復旧Grantは消費済み
7. 復旧リンク再使用・誤User指定・一般Userによるリンク発行が拒否され、いずれも元のUserやScoreを変えないこと

## C. 従来LINE認証の回帰（試験専用LINE Channelがある場合のみ）

試験用LINE Userでログイン→既存Group/Score表示→ログアウト→LINEで再ログイン→同じUser/Player/Scoreの確認。試験用LINE設定が無い場合は必ずBLOCKEDであり、実機PASSと報告しない。

## 即時STOP条件

- RP/Origin mismatch、試験用D1が本番や既存Previewを参照、既存LINE Channelへ接続 → **STOP**。本番URLを使って「代わりに試す」ことはしない
- User ID・Player IDの取り違え、GroupやScoreの増減、他人のGroupを閲覧できる状態 → **FAIL/STOP**。証跡を秘匿して保全し、隔離環境の試験を中断
- Passkey端末未対応 → **BLOCKED**。Android/Chrome/Providerのバージョンを記録。既存実ユーザーのCredentialを代用しない
- パスキー復旧リンク使用後の再使用成功、期限切れで登録成功 → **FAIL/STOP**
- 409 passkey_not_completed → 新しいChallenge/Grantが必要なケースがある。推測でDBを手修正しない。失敗原因を隔離環境で診断
- ログイン後に履歴が表示されない → 同一Userセッションと、login=success後のCloud D1 persistence modeを確認。既存ローカルデータ移行は実行しない
- 認証トークンやCookieがスクリーンショット等に露出 → **STOP**。失効措置と共有範囲確認

## 実機受入記録テンプレート

- テスト環境（ホスト名のみ）：
- PR #358の検証対象HEAD SHA：
- Worker / D1 / LINEの隔離バインド確認：YES / NO
- 本番アクセス：なし / あり（ありならSTOP）
- 端末・Android・Chromeバージョン：
- パスキープロバイダー：
- A. 新規招待：PASS / FAIL / BLOCKED
- B. 既存User復旧：PASS / FAIL / BLOCKED
- C. 従来LINE：PASS / FAIL / BLOCKED
- 別訪問パスキーログイン：PASS / FAIL / BLOCKED
- User/Player/Group/LINE ID/Score前後差分：0 / 差分あり / 未検証
- 再利用拒否：PASS / FAIL / BLOCKED
- 秘密値を含まない障害メモ：
- 実施者/確認者：
- 本番へのマージ・移行・デプロイ：**未承認・未実施**

**注意**：CIの実SQLite/WebAuthn P-256検証はAndroid Chromeの実機受入を代替しない。試験環境作成も本番リリースも別承認が必要。
