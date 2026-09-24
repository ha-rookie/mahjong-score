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

Phase 2では、普段一緒に麻雀をする固定GroupのMemberへ拡張済み。

## Success Condition

- 実際の麻雀中にスマートフォンから迷わず結果を入力できる
- 三麻のポイント計算を正しく行える
- Session、月間、年間、通算の成績を確認できる
- LINE Loginした固定GroupのMemberが複数端末から同じD1 dataを安全に利用できる

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

## Phase 1 Completion

2026-09-24時点でPhase 1の実装・CI・Production deploy・スマートフォン実機確認を完了した。

- Human TBD-001〜005: Resolved
- Open Issue / Open PR: 0
- 最新main CI / Production deploy: Success
- 主要スマートフォンフロー: Human確認済み
- Backup / Restore: Phase 1ではRepository ownerを暫定Adminとして実機利用し、将来の認証・認可導入後はAdmin限定へ移行
- Deferred: GameTag UI / Player別Memo / finalized Session訂正 / 同一Session内参加者変更 / 本格的な認証・認可

## Phase 2 Scope

Phase 2では個人端末内の記録アプリから、固定Groupの複数Memberが安全に利用できるWebアプリへ拡張する。

実装順序は次を基本とする。

1. Cloudflare側のアクセス制限・Phase 2環境準備
2. D1 database作成・binding・migration基盤
3. Worker API / D1 persistence
4. LINE Login
5. User / Player invitation・linking
6. Admin / Member authorization enforcement
7. multi-device sync / concurrency / audit log

PWAはPhase 2完了条件から外し、Phase 3以降の独立FeatureとしてDeferredする。server dataのoffline write/syncはPWA再開時にも初期範囲へ含めない。

- Authentication
- Group authorization / Admin・Member role
- Worker API
- Cloudflare D1
- multi-device sync
- stale update / concurrency control
- server audit log
- Group作成とBackup / RestoreのAdmin限定化

PWA backlog: Issue #160。Manifest / App Icon / Service Worker / installability / standalone / static asset cacheをPhase 3以降で再検討する。D1/API dataのoffline write/syncは別設計とする。

## Technology

- Frontend: React + TypeScript + Vite
- Runtime: Browser + Cloudflare Worker API
- Hosting: Cloudflare Workers + Static Assets
- Persistence: Cloudflare D1
- Authentication: LINE Login
- Authorization: System Admin / Group Admin / Member
- Recovery: D1 Time Travel
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


## Phase 2 Completion Status

2026-09-25時点でPhase 2の主要実装はProductionへ反映済み。

- Worker API / D1 persistence
- LINE Login
- User / Player invitation and linking
- System Admin / Group Admin / Member authorization
- multi-device data sharing
- Session / Game optimistic concurrency
- structured audit log / request correlation
- Production Security Headers
- D1 Time Travel recovery runbook / Preview recovery rehearsal
- PWA: Phase 3以降へDeferred（Issue #160）

最終完了判定はIssue #145のRepository hygiene / documentation sync / smartphone smokeを満たした時点とする。
