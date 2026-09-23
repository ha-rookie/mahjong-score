# Project Overview

## Project

Mahjong Score / 三麻スコア

GitHub Repository: `ha-rookie/mahjong-score`

現時点の画面表示名は「三麻スコア」。Repository名は将来の四人麻雀対応を考慮して `mahjong-score` とする。

## User Problem

仲間内の三人麻雀では、半荘ごとの結果、チップ、その日の累計、月間・年間・通算成績を簡単に残し続ける手段が必要。

卓上での入力回数を増やしすぎず、後から成績や印象的な出来事を振り返れるようにする。

## Target User

Phase 1はRepository owner本人。

Phase 3以降で、普段一緒に麻雀をする固定グループのメンバーへ拡張する。

## Success Condition

- 実際の麻雀中にスマートフォンから迷わず結果を入力できる
- 三麻のポイント計算を正しく行える
- Session、月間、年間、通算の成績を確認できる
- localStorageからD1へ段階移行できるデータ構造になっている

## In Scope

Phase 1:

- 三人麻雀
- 3人参加 / 4人回し三麻
- Session開始時の参加者固定
- 半荘結果入力
- 自動ポイント計算
- チップ精算
- 履歴 / 集計
- Session Memo
- localStorage
- JSONバックアップ / 復元

## Out of Scope

- 同一Session途中での参加者変更（参加者変更時はSessionを終了・精算し、新しいSessionを開始）

Phase 1では以下を実装しない。

- 四人麻雀
- GameTag UI（仕様再定義まで保留）
- Player別Memo UI（本人識別・認可導入まで保留）
- D1
- Worker API
- LINE Login
- Google Login
- グループ認可
- 複数端末同期
- サーバー監査ログ

## Technology

- Frontend: React + TypeScript + Vite
- Runtime: Browser
- Hosting: Cloudflare Workers + Static Assets
- Persistence: localStorage
- CI / Deploy: GitHub Actions + Wrangler
- Repository: `ha-rookie/mahjong-score`

## Human Decision Points

- Product purpose and priority
- UI discomfort and acceptance
- Production release
- Important merge
- Authentication and billing
- Asset final approval

## Release Definition of Done

Use [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
