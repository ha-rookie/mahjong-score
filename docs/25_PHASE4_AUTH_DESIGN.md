# Phase 4 詳細設計提案: LINE / Passkey併用・ログイン情報管理

- Status: Proposed / Issue #335 / 2026-10-20 / **Design-only。現行mainの挙動ではない**
- 関連決定: docs/adr/ADR-0002-identity-credential-lifecycle.md
- 目的: 認証方式とUser・Playerを分離し、最小限の認証方式追加・管理を実装可能な粒度へ落とす。
- 正本との関係: 本書はレビュー用のPhase 4設計案。承認時には01/02/08/10/11/12/15/20/06の担当範囲へ要件と設計IDを反映し、本書は移行計画・詳細プロトコルの参照元とする。既存設計を無断で上書きしない。

## 1. 現行実装と不変条件

- users.id はアプリ内認証・認可主体。external_identities(provider='line', provider_subject) はLINEとUserを結ぶ。group_players.user_id と group_memberships はUserとPlayer/Groupを結ぶ。Game/Session成績はPlayer ID基点。
- POST /api/groups/:groupId/players/:playerId/invitations（現行LINE URL）、DELETE /api/admin/groups/:groupId/players/:playerId/link、PATCH /api/admin/groups/:groupId/users/:userId は既存機能。再実装しない。
- 現行LINE Loginは招待なしでも認証成功時に未所属Userが作成され得る。Group利用は不可。初回Passkeyによる新User登録のみ招待必須とする。**「未招待ではログインできない」と「未招待ではグループが使えない」を混同しない。**
- 現行の「LINE連携解除」はPlayer↔User解除でありLINE Credentialの解除ではない。画面ラベルは変更案とする。
- LINE Loginの不調（原因未特定）をPasskey追加で解消済み扱いしない。既存#276/#278の回帰は維持。

## 2. 利用シナリオと状態遷移

| ケース | 起点 | 結果 |
| --- | --- | --- |
| LINEだけの既存User | LINE通常ログイン | 既存User IDと所属を維持 |
| Passkeyだけの新規参加 | 管理者の既存招待→方式選択→登録 | 新User＋Credential＋招待先Playerへのリンク |
| 同一Userに両方 | 有効なログイン→直近再認証→別方式を登録 | User ID不変、2方式有効 |
| Credentialを1つ削除 | ログイン情報管理→削除確認→再認証 | 残りの方式で再ログイン可能 |
| 最後のCredentialを削除 | 本人/システム管理者が失効 | User/Player/Score保持、全セッション失効・新ログイン不可 |
| ログイン不能で再参加 | 対面で管理者確認→既存Playerリンク解除→招待 | 新Userを既存Playerへリンクし過去成績維持。旧Userの他Group権限は継承しない |
| 既存Userに別GroupのPlayerを紐付け | 現行「既存User」 | 新認証情報・新Userの作成不要 |

0件のUserは退会/削除ではない。UserからCredentialを失効する操作とPlayerからUserを解除する操作は完全に別。User IDの自動マージ・旧Userから新Userへの権限移管を行わない。

## 3. DB差分（Proposed / Migrationは未作成）

1. users.auth_version INTEGER NOT NULL DEFAULT 0 を追加候補。signed Cookieにversionを含め、API認証の都度UserのDB現行値と比較。Credential追加・失効時はversionを増分し当該Userの全sessionを即時失効。既存version無しCookieは移行期間にversion=0として照合する案（ロールアウト時テスト必須）。
2. passkey_credentials: id (opaque UI ID), user_id FK(users), credential_id（base64url bytesの一意キー）, public_key（検証用公開鍵）, sign_count, transports, device_type/backup flags（分かる範囲）, label, created_at, last_used_at, revoked_at。UNIQUE(credential_id)。公開鍵を保存し、秘密鍵・生体情報は保存しない。同期Passkeyではsign_countが0や非単調になり得るため、単純な増分必須チェックに依存しない。
3. auth_challenges: id, challenge_hash, purpose(register_invite/register_account/login), user_id nullable, provisional_user_id nullable, invitation_id nullable, expected_origin, expires_at, consumed_at, created_at。短時間/一回限り、目的とUser/招待文脈を分離。機密Challenge・招待Tokenをログに出さない。
4. line_login_states: 既存nonce/stateを再利用しながらlogin・invite・linkの目的と対象userIdをサーバー保持するための必要最小限の追加列を検討。クエリ文字列だけで対象Userやmodeを信じない。
5. 認証情報0件でもusers/group_players/group_memberships/players/game_resultsは維持。個々のCredential削除は原則revoked_at論理失効を推奨し、古いWebAuthn資格情報をサーバー側で再使用不可にする。

DBトランザクション境界: 招待消費・新User作成・Passkey Credential作成・Player紐付け・Group Membership作成は**すべて原子的に成功か失敗**させる。署名検証はDB更新より先。既存のredeemInvitationByIdを単純に後段で別トランザクション呼出ししない。Challengeは検証成功時に1回だけ消費。レース/409時は一貫した再試行案内にする。

## 4. API候補（名称は設計レビュー時確定）

| Method | Path | 目的 / 権限 |
| --- | --- | --- |
| GET | /api/auth/methods | 現在UserのLINE/Passkey一覧。本人のみ |
| POST | /api/auth/passkeys/register/options | 招待トークン又は認証済みUserから登録Challenge発行 |
| POST | /api/auth/passkeys/register/verify | WebAuthn登録応答を検証、必要なら原子的な招待受諾 |
| POST | /api/auth/passkeys/login/options | 未ログインでも使用可。Challenge発行（discoverable Credential） |
| POST | /api/auth/passkeys/login/verify | Assertion検証→同一User IDでセッション発行 |
| DELETE | /api/auth/passkeys/:credentialId | 本人の対象Credentialを失効、セッション全失効 |
| GET | /api/auth/line/link/start | ログイン中の既存UserへLINE連携を開始（新User作成不可） |
| DELETE | /api/auth/line/link | 本人のLINE Identityを解除、セッション全失効 |
| DELETE | /api/admin/users/:userId/auth-methods/:methodId | System Adminによる対面確認後の対象Credential失効 |

既存LINE login/callback・/api/auth/me・logoutと共存させる。line/linkのcallbackは既存loginとモードを厳密に区別し、linkモードでは別Userに既登録のLINE subjectを409で拒否。新User自動生成や他Userへの資格情報の黙示的付け替え禁止。

招待URLは既存発行APIのまま、返すURLのみ方式選択入口（例: /?invite=<opaque>）へ変更する案。URL fragment/ブラウザ履歴/Referrer/Analytics等へTokenを残さないよう、受領直後に安全な一時文脈へ引き取りURLを清掃する。招待データの保存は既存token_hash、期限7日、one-time/revokeを尊重。LINEに渡す際は既存サーバー側stateへInvitation IDを保持する。Passkeyでは招待検証→ChallengeへInvitation IDを束縛する。

WebAuthnの検証: ランダム32byte以上Challenge、5分程度のTTL案、適正RP ID、期待origin、type、署名、user presence/verification、Credential IDの一意性、Challenge/Origin/RP IDの一致、失効済みCredential拒否。userVerification=required、discoverable credentialを基本。iOS/AndroidブラウザおよびCloudflare Workersでのライブラリ互換性は**未検証**。Preview/Productionは原則別RP IDとして試験し、本番ドメイン変更時の再登録運用も確認する。

## 5. セッションと権限

- auth_version比較はGET /api/auth/meだけでは不十分。**すべての保護API**の認証解決で照合。署名付きCookieのuserId/exp/versionが正しくてもDB側version不一致・User不存在なら401、必要なら期限切れCookieを削除。
- 方式失効とusers.auth_version増分は同一D1トランザクションで確定。別端末・別タブ・旧LINE/Passkeyセッションを全拒否。
- 新規ログイン時・スライディング更新時はDBの現行auth_versionを使う。既存#301の401時入力保持、手動再ログイン、明示logoutは維持。
- Credential追加・削除は本人の直近再認証が必要。System Admin失効操作は管理者権限＋直近再認証＋監査を必須とする。再認証の具体的な有効時間（例5分）はHuman設計レビューで確定。
- Group Adminには他Groupを横断するUser Credential削除権限を付与しない。System Adminが唯一の資格情報を削除して全管理者が操作不能になるリスクは操作前に警告する。新しいセルフサービス復旧は実装しない。
- 招待QR/URLを対面で渡す運用でも盗用リスクはゼロではないため、トークンの短命化・一回限り・対面確認・発行/消費監査・レート制限を維持。

## 6. UI差分

1. 未ログイン画面: LINEでログイン / パスキーでログイン。パスキー未登録なら通常ログイン画面で新規Userは作らない。
2. 招待入口: 管理者発行URLからLINEで参加 / パスキーを登録して参加を選ぶ。キャンセル・端末非対応・招待期限切れ・使用済み/競合を分かりやすく表示。
3. アカウントメニュー: 「ログイン方法の管理」。登録方法の一覧、Passkey名称・最終使用日時、LINE連携、方式追加・削除・再認証・最終方式削除時の警告。
4. 既存Player管理: 「LINEで招待」→「招待」、「LINE連携済み」→「User紐付け済み」、「LINE連携解除」→「User紐付け解除」など、CredentialとPlayerリンクを誤認しない表示。
5. System AdminのUser管理: LINE/Passkey認証情報の存在/数・失効アクション。SecretやCredential公開鍵、招待Token全文は表示しない。既存User→Player紐付けボタンは維持。
6. 401再ログインOverlay: LINE/Passkey両方から選択。編集中スコアは残し、元のMutationは自動再送しない。

## 7. 実装差分と分割提案

| Slice | 変更対象 | 完了ゲート |
| --- | --- | --- |
| S0 技術検証 | Workers向けWebAuthnライブラリ・RP ID・crypto検証、iOS/Android smoke | 動作証跡・採否をIssue記録 |
| S1 DB+セッション | 新規migration、認証解決共通関数、auth_version/失効・回帰テスト | 既存LINE/招待/401回帰＋最終Credential失効を確認 |
| S2 Passkeyログイン+招待 | 新Worker auth/passkey、方式選択UI、招待受諾、テスト | 新規招待・登録・Passkey login・競合処理確認 |
| S3 アカウント管理+LINE連携 | methods API、LINE linkモード、Credential失効/管理者失効UI、テスト | 3つのUserパターン・0件・不正操作拒否 |
| S4 実機・設計同期 | iPhone/Android、既存LINE、D1 migration preview、運用/テスト正本 | Human実機承認と独立したmerge/Production判断 |

変更候補: migrations/新規SQL、src/worker/auth/line-login.ts、src/worker/auth/passkey.ts（新規）、src/worker.ts、src/App.tsx、src/components/auth-status.tsx、src/components/member-access-management.tsx、必要な新アカウントUI、tests/。既存Score/Session Domainは非変更。

**正本設計への反映先**: 要件→01、構成/認証→02/08、画面→10、DB→11、API→12、Security→15、テスト→20、対応表→06。ADR-0002は採用理由、Issue #335は個別計画・Acceptance/リスク管理を担当。重複全文コピーはしない。

## 8. 検証マトリクス / 受入

- LINEのみ / Passkeyのみ / 両方、同一Userでログイン、既存Player/Score維持。
- 招待経由Passkey新規User作成は可能、無招待Passkey新規登録は拒否、既存認証方式での再ログインは招待不要。
- 既存LINEのみUserにPasskey追加→同じUser、他UserのLINE subjectやPasskey IDは流用不可。
- 既存Userを別GroupのPlayerへ管理者が紐付けできる。Player↔User解除はCredentialを消さない。
- 最後の認証方式削除→全ての旧CookieからAPI401、Group/Player/Scoreはそのまま。旧Passkey署名・旧LINE Subjectは既存Userを復活させない。
- Challenge再利用、期限切れ、wrong origin/RP ID、無効署名、重複Credential、招待二重消費、権限越境、CSRF、raceを拒否。
- iOS Safari、Android Chrome、ホーム画面Web App、Passkey非対応端末、LINE login fail UXを実機確認。
- 全操作の監査イベントと秘密値秘匿、データ移行安全性、rollback/停止条件、CI/Previewを検証。

## 9. 未確定・Human Gate

- T1: Cloudflare Workersで実利用するWebAuthnライブラリ/Version、ブラウザ実機挙動。候補を固定していない。
- T2: Passkey RP IDと本番運用ドメインの長期固定。workers.devから独自ドメインへの移行がある場合の再登録。
- T3: 再認証の許容経過時間（セキュリティと使いやすさのトレードオフ）。
- T4: 既存招待URLから方式選択への安全な移行と旧URL後方互換。
- T5: 認証情報の完全削除と論理失効＋監査履歴の保持期間。デフォルトは論理失効。

Risk: High。Auth/DB/Session/認可境界変更。**T1/T2/T4の検証失敗、他Userへの誤紐付け可能性、旧Cookie失効不可、マイグレーションの影響不明時はSTOP。** 本設計だけでMigration実行、Secret、main merge、Production deployは認めない。

## References

- GitHub Issue #335 および既存mainの docs/01,02,08,10,11,12,15,20,06 と src/worker/auth/line-login.ts, src/worker.ts。
- MDN Web Authentication API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API
- MDN Passkeys: https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys
- FIDO Passkeys journey: https://fidoalliance.org/wp-content/uploads/2025/03/Passkeys-The-Journey-to-Prevent-Phishing-Pt1.pdf
