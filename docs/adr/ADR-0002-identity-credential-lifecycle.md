# ADR-0002: User/Playerと認証情報を分離したLINE・Passkey併用

- Status: Proposed（未承認、main未反映）
- Date: 2026-10-20
- Decision Owners: Human
- Related Issue: #335
- Related Design: docs/25_PHASE4_AUTH_DESIGN.md

## Context

現行の三麻スコアはPlayer（麻雀成績）とUser（権限）を分け、外部LINE subjectをexternal_identitiesからUserへ紐付ける。既存管理画面にはPlayer↔Userの招待・解除・既存User選択が実装されているが、LINE認証情報そのものの一覧・解除はない。LINE Loginでログインできない実利用者がおり、PasskeyとLINEを選べるようにしたい。対面で麻雀をする少人数グループなのでセルフサービス復旧を求めない。

## Decision Drivers

- LINEのみ・Passkeyのみ・両方を使うUserを同居させる
- User・Player・Score・Membershipをログイン方式から独立させる
- 既存の招待、既存User選択、Playerリンク解除を作り直さない
- 認証情報が0件でもUser/Player/成績を保持する
- 不正なCredential付け替えと認証削除後の古いCookie継続利用を防ぐ
- 最小のCloudflare Workers/D1差分で実現する

## Options Considered

### A: LINEとPasskeyごとに別Userを生成し、Playerだけ付け替える

- 長所: 既存のPlayer紐付け管理だけで回復できる。
- 短所: 両方の方式で同じUserを使えず、他Groupの権限を引き継げない。今回の主要要件を満たさない。

### B: Userを基点に複数の認証資格情報を紐付ける（推奨）

- 長所: 同一UserでLINE/Passkey双方にログイン可能。0件状態と資格情報の個別削除を表現できる。既存PlayerとScoreはそのまま。
- 短所: Passkey登録・削除・Challenge管理とセッション失効検証の追加が必要。

### C: 外部認証基盤へ全面移行

- 長所: 一部の認証実装を委託できる。
- 短所: 既存LINE・招待の改修量、運用依存が大きく、少人数のPoC/ショーケースに過剰。

## Decision（提案）

Option B。User IDは不変とし、LINEは既存external_identities、Passkeyは新規passkey_credentialsへ保持する。0..1 LINE、0..N Passkey、合計0件を許容。認証方式の追加は現在のUserへのCredential追加。ログイン不能時の再参加は管理者の対面確認と既存Playerリンク解除・招待・既存User紐付けで処理し、旧Userと新Userの自動統合はしない。

新規Passkey登録によるUser作成は管理者招待経由のみ。LINEは既存動作（未招待でもUser作成される場合はGroup非参加）を今回は変更しない。既存の認証方式を使ってGroupに参加する場合も、招待または既存Userの管理者紐付けが必要。

User側のCredential失効時はセッション世代の更新により当該Userの既存セッションを全失効させる。方式はsigned CookieにauthVersionを追加し、毎回D1側の現行versionとの照合を行う案を第一候補とする。旧Cookieとの互換性・移行手順は詳細設計を経て決定する。

## Consequences

- 現行UI「LINE連携解除」は実際にはPlayer↔User解除なので表示を「ユーザー紐付け解除」等へ修正。
- User/Playerリンク管理と認証Credential管理は別UI/別API。
- 管理者はCredentialを失効できるが、本人に代わって秘密鍵を作れない。
- 最後のSystem Admin資格情報削除に対する警告と運用手順は必要。自己回復UIは不要。
- Google等の他Provider、Player/Score再構築、独自メール復旧、認証方式ごとの新User強制作成は対象外。

## Validation / Revisit

Credential 3パターン・0件、既存Userリンク、複数Group境界、招待二重利用、WebAuthn origin/RP ID・challenge replay、Cookie全失効、iPhone/Android実機を受入にする。Cloudflare Workersライブラリ検証やデータ移行・同時操作で想定外の制約が判明した場合は実装を止めて判断を戻す。
