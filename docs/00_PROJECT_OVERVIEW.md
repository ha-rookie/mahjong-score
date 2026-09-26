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

Phase 3では、普段一緒に麻雀をする固定GroupのMemberへ拡張済み。

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

## Original 4-Phase Roadmap

当初からのProject roadmapは次の4 Phaseを正本とする。

### Phase 1: 機能PoC — Completed
- localStorage
- 認証なし
- 本人利用
- 三麻の入力・計算・履歴・成績がアプリとして成立することを確認

### Phase 2: D1 / API / 業務システム基盤 — Completed
- Cloudflare D1 / Worker API
- environment / migration / CI / deploy
- input validation / parameterized SQL
- Security Headers
- optimistic concurrency
- structured audit log / request correlation
- D1 Time Travel recovery

### Phase 3: 仲間内の複数ユーザー利用 — Functionally Completed
- LINE Login
- one-time invitation
- User / Player separation and linking
- System Admin / Group Admin / Member authorization
- multi-device data sharing / Active Session refresh

Phase 3機能は実装順序上Phase 2と連続して実装し、Issue #145のPhase 2 completion auditへ前倒しで含めた。この記録は変更しないが、roadmap上の責務はPhase 2とPhase 3に分けて扱う。

会社のSEを対象とするUser Testは新しいPhaseを追加せず、**Phase 3 Release Candidate Gate** として扱う（Issue #165）。

### Phase 4: Authentication Extension — Not Started
- Google Login等の追加Authentication Provider
- 同一Userへ複数External Identityを紐付け可能にする
- 麻雀DataをAuthentication Providerへ直接依存させない

Phase 4はUser Test結果と実利用の必要性を確認してから着手判断する。

## Cross-Phase Backlog

4 Phase roadmapとは別に、品質・UX改善として管理する。

- PWA: Issue #160 — Deferred
- 長期性能試験: Issue #137 — DB / local 5y・10y evidence取得済み。Production smartphone felt-performance確認待ち

PWAのoffline write/syncはPWA本体とは別設計とする。

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

## Phase 2 / Phase 3 Implementation Status

2026-09-25時点で、元のroadmap上のPhase 2とPhase 3に相当する主要実装はProductionへ反映済み。

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

Issue #145は2026-09-25にCompletedでclose済み。次のGateはIssue #165のPhase 3 Release Candidate / SE向けUser Test readinessとする。

## Current RC / Production Status — 2026-09-26

- current `main`には#203（D1 read optimization）、#206（履歴削除stale recovery）、#207（SE User Test gate同期）がMerge済み
- #205以降、PR CIとMergeはremote D1へ自動アクセスしない
- Production D1 migration / Worker deployは`main`からのmanual `workflow_dispatch`のみ
- current `main`のruntime変更#203 / #206はProductionへ未反映
- 現在remote D1へアクセスできずLINE Loginが成立しないため、Issue #165のSE User Test GateはOperational Blockerで停止中
- D1復旧まではremote benchmark / fixture / migration / deployを追加実行しない
- D1復旧後は最小限のaccess確認 → Human承認 → manual Production deploy → LINE Login smoke → #201 → #137 → #165 User Test handoffの順で再開する
