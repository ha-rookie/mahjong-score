# 三麻スコア｜Phase 4 P0 Android Chrome 実機受入手順（PR #358）

> 2026-11-01 準備版。**検証の実施記録ではない**。main・本番Worker・本番/既存Preview Remote D1・Secrets/varsには変更を行っていない。
> 対象は統合Draft PR #358のみ。PR #346・#354～#357は既に統合履歴であり個別マージしない。

## 現在の判定：NO-GO（実機で操作しない）

PR #358の現状では `src/worker/auth/passkey-line-free.ts` の
`PASSKEY_ORIGIN=https://mahjong-score.ha-rookie.workers.dev` と
`PASSKEY_RP_ID=mahjong-score.ha-rookie.workers.dev` が固定値であり、
`passkey-line-free-http.ts` は受信HTTP RequestのoriginとOriginヘッダーも
この値に完全一致させる。**本番のURLではDraftのコードが稼働していない**。
別Preview URL・トンネル・Android上のlocalhostにブラウザでアクセスしても
RP IDとOriginが一致しないため登録・署名ログインは検証できない。
安全に実機テストするには、**本番とは異なる固定HTTPSホスト/RP IDをサーバー側の
環境別設定として厳密に割り当てる準備**と、**合意された隔離DB**が必要。
端末側からOrigin/RP IDを指定できる構成、無条件の任意Origin許可、
本番ホストへの別ルート、Cookie共有・DB共有での代用は禁止。

### 実機前のGO判定（すべて満たすまでは操作禁止）

- [ ] **本番のままではない**、承認済みのテスト用HTTPSホストを確定（URLは発行後に記入、ここで想像しない）。
- [ ] 本番Origin/RP IDは変更せず、テスト用の**固定サーバー設定**でHTTPS Origin=テストURLのorigin、RP ID=ホスト名、`auth_challenges`のexpected_origin/rp_idも一致する。変数の任意入力やリクエスト由来の暗黙許可は禁止。Chromium WebAuthnのsecure-context条件を満たす。
- [ ] テスト用Workerが実際にPR #358と同じ承認済みコミットからビルドされ、`/api/auth/passkey/*`・`/api/auth/me`・`/api/groups`を処理できる。
- [ ] DBは**本番D1と既存Preview D1からも分離した検証専用の空DB**。`wrangler.jsonc`にある本番DB IDと既存Preview DB IDのいずれも結合しない。実施者がWorkerのBinding IDを検証。実データをコピーしない。
- [ ] テスト用DBにMigration 0001〜0012を順に適用し、招待・User/Player/Group/GroupMembership/セッション・対局・Scoreの**架空データ**を投入する。移行前後のスナップショットと復旧手段を準備。
- [ ] ログイン用セッションの署名鍵はテスト専用。LINE Channel Secret等の本番秘密情報は複製しない。LINEの正常系を試す場合は別途テストChannelと許可済みコールバックを用意し、Production LINE設定変更禁止。
- [ ] テストURLへのアクセス制御、トークン・WebAuthn応答・Cookieのログ非保存、アクセス権者、テストデータ削除方法を確定。Cloudflare Preview URLが初期状態で公開になり得る点に注意。
- [ ] **リモートテスト環境の作成・設定・Migration・デプロイは実施者の別承認を得る**。このチェックシートの追加やCI実行はその承認を意味しない。
- [ ] 最新Draft HEADのCIがPASS。mainに変更がなく、本番Worker / Remote D1 migration/ deployを未実施であることを再確認。
- [ ] Android端末はChrome最新版・有効な画面ロック（PIN/指紋等）・パスキー保存先が利用可能な状態。Chromeで直接開き、LINEやメールアプリの**アプリ内ブラウザを使わない**。PWAインストールは前提にしない。
- [ ] 新規招待テスト利用者と既存User復旧利用者は**別の架空User/Player**として準備。ブラウザProfile/Chromeデータ、関連パスキー、テストCookieの干渉を避ける。

## 受入前の不変量（検証用IDと数値は実施時に記録）

テスト専用DBに次の対象を作成してRead-Onlyスナップショットを採取する。

- Group G：既存Group ID。Player P-new：`group_players.user_id IS NULL` の未連携Player、**過去対局/成績あり**。
- User U-old：LINE外部IDのある既存User。Player P-old：`group_players.user_id=U-old`、既存Group/Membershipおよび**過去対局/成績あり**。
- System Admin A：テスト専用管理者アカウント。一般member M（権限拒否ケース用）。
- `users`、`players`、`groups`、`group_players`、`group_memberships`、`sessions`、`games`、`game_results`、`chip_results`を含む関連テーブルを対象に、ID/件数/紐付け/成績（点数・順位・チップ）を記録。
- 認証系で追加・更新が許されるのは、設計通りの`auth_challenges`、`invitations`、`passkey_recovery_grants`、`passkey_credentials`および新規招待時のみの`users/group_players/group_memberships`。**復旧時は元User/Player/Group/Membership/LINE ID/対局/成績を変更しない**。

## Android Chrome 手動受入シナリオ

手順の「成功」は**現時点ではすべて未実施**。各操作で端末・Chrome版・日時・テストURL（トークン部分は記録しない）・結果を記録する。

### A. LINEなし新規招待（未連携Player P-new）

1. テスト用System AdminまたはGroup Adminでログイン。G内の未連携P-newを選び**「招待URLを発行」**。既存連携済みPlayerには通常の新規招待を出さない。
2. 招待URL `/?invite=<token>` を、受信者のAndroid **Chromeのアドレスバーから直接開く**。URLは7日有効・1回限り。トークン全文はスクショ・Issue・チャット・CIログに貼らない。
3. **「パスキーで参加（初回登録）」**をタップ。端末の画面ロックとパスキープロバイダを使って登録。LINE認証画面へ遷移しないこと。
4. `/?login=success`を経てログイン。G、P-newの**同じPlayer ID**、登録前に存在した過去対局/点数/順位/チップが読めること。
5. 新User IDがP-newにだけ紐付くこと、旧Group/Player/過去Scoreの内容が変わらないことをテストDBのスナップショットで確認。新規UserとMembershipの増加は想定内。
6. アカウントメニューから**ログアウト**。トップの「パスキーでログイン」→登録したパスキーで認証し、**同じ新User/G/P-new/過去成績**を確認する。
7. **使用済み招待URL**で登録を再試行して拒否されること。旧招待トークンは公開しない。

### B. 既存LINE連携Userの復旧（User U-old → 同一User）

1. テスト用System Adminでログイン。G内の**既にU-oldに紐付いたP-old**を画面で確認。本人確認はテスト運用で別途実施。一般member/Group Adminに**「パスキー復旧」**操作権限を与えない。
2. **「パスキー復旧」**→確認ダイアログで対象Playerと**既存User ID**が一致することを確認して発行。復旧URL `/?recover=<token>` は24時間・1回限り。本人への安全な送付に限定し公開Issueには貼らない。
3. Android Chromeから復旧URLを開き、**「元のアカウントにパスキーを登録」**をタップ。LINEログイン画面なしで端末側パスキーを作成。2分のWebAuthn Challenge期限内に完了。
4. 認証後の`/api/auth/me`が**U-oldと完全一致**すること。G、P-old、過去Game/Score/順位/チップが表示されること。ユーザー名の一致だけで判断しない。
5. **ログアウト**→「パスキーでログイン」→端末に登録したパスキーでサインイン。再び**U-oldと一致**し、別Groupを含む元Membershipも維持。LINE外部識別子、User/Player/Group/対局/成績の前後スナップショット完全一致を検証する。
6. 使用済み復旧URLで二度目のパスキー登録を試して拒否されること。異なる対象User指定の復旧発行は409、一般memberからの発行は403（補助のAPI試験）。
7. 同じテストUserの既存LINEログインが失われていないことは**テスト専用LINE Channelを用意できる場合だけ**検証する。本番LINEアカウント／本番D1で試さない。

### C. 端末・エラー・旧データの確認

- Chromeで**ログアウト前後に過去成績が同じ**（対局数・点数・順位・チップ）かを比較。
- Android端末に旧`mahjong-score:app-data:v1`が保存されている場合、アプリはD1表示へ自動切替しない場合がある。まず**専用Chrome profile/テスト端末**で検証し、旧localStorageを本番端末から消さない。
- 新規招待、復旧ともに登録中の操作キャンセル・2分超過→エラーを表示し、既存User/Player/Scoreが変わらないこと（新しいURL/Challengeでやり直す場合は安全性確認）。
- パスキーを削除すると別のログイン手段がないユーザーをロックアウトするおそれがある。実機テストに使用した認証情報は受入記録と紐付けて管理し、**Cleanupまで安易に削除しない**。
- 端末スクリーンショットは**URLトークン、Cookie、個人データを伏せる**。合否とコード/HTTP statusだけ残す。

## 実機受入判定表（全て「未実施」からスタート）

| ID | 判定条件 | 期待結果 | 状態 |
| --- | --- | --- | --- |
| ENV-01 | 隔離HTTPSホスト/RP ID/D1/API鍵が一致 | 本番へ通信・書込なし | 未実施／**NO-GO** |
| A-01 | 未連携P-newを指定して招待 | 招待URL発行、他Player変更なし | 未実施 |
| A-02 | Android ChromeでLINEなし登録 | 登録成功、期待する新User→既存P-new | 未実施 |
| A-03 | ログアウト→パスキー再ログイン | 同じ新User、G/P-new/過去Score | 未実施 |
| A-04 | 使用済み招待URLの再使用 | 拒否、Score変更なし | 未実施 |
| B-01 | System AdminがU-old/P-oldを厳密に指定 | 24h復旧URL、権限誤用拒否 | 未実施 |
| B-02 | Android ChromeでLINEなし復旧 | 同じU-oldへのCredential追加 | 未実施 |
| B-03 | ログアウト→パスキー再ログイン | 元U-old、P-old、G、過去Score一致 | 未実施 |
| B-04 | 復旧URL再利用・権限不足 | 拒否、User/Player/Score変更なし | 未実施 |
| DATA-01 | before/afterスナップショット比較 | 既存User/Player/Group/Game/ScoreとLINE ID不変 | 未実施 |
| REG-01 | 既存LINEの正常系 | テスト専用LINE Channelで確認する場合のみ | 条件付き／未実施 |

## STOP・Cleanup・承認境界

- 期待と違うOrigin/RP ID、D1 Binding、User ID、Player ID、Scoreを見たら**即停止**。招待・復旧発行を続けない。
- 本番ドメインへのDraft配信を試さない。既存Preview DBを安全と推定しない。test-only鍵・D1/パスキーで運用する。復旧操作は対象UserのGroup権限全体に作用するため、**本人確認なしにリンクを渡さない**。
- テスト後は**指定した隔離テストDBとテストアカウント/Passkeyだけ**を対象とするCleanup計画と実行承認を別途確認。実運用・本番のデータは削除しない。
- main mergeはProduction Worker自動deployとD1 Migrationの引き金になる。**本番マージ・本番デプロイ・Remote D1（本番/既存Preview）の変更は別の明示承認まで禁止**。
- 合格には実機記録・GitHub CI・テスト用DBの前後差分・不具合有無・本番切替計画/rollbackが必要。この文書を追加しただけでは実機合格ではない。
