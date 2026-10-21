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
