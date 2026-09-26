# D1 Long-term Performance Benchmark — Historical Preview Evidence

## Status

This document records the **historical Preview D1 benchmark** used for Issue #137 before the performance test strategy was changed.

**Do not use this document as the current execution procedure.**

Current performance testing and safety rules are defined in `23_PERFORMANCE_D1_TEST.md`.

As of 2026-09-26:
- automatic PR execution of this remote benchmark has been removed
- `.github/workflows/d1-performance-benchmark.yml` is `workflow_dispatch` only
- PR CI must not access remote Preview D1
- large 5y / 10y regression fixtures run on local D1
- remote Performance D1, if used later, is isolated from Production / Preview and requires explicit manual confirmation
- while D1 is quota-limited or otherwise unavailable, do not dispatch this legacy Preview benchmark

## Historical purpose

Issue #137のRC性能確認として、Production DBを水増しせずCloudflare Preview D1に専用fixtureを一時投入し、長期利用相当のDB性能Evidenceを取得した。

## Historical load model

- 5年相当: 260 Session / 3,120 Game / 9,360 GameResult
- 10年相当: 520 Session / 6,240 Game / 18,720 GameResult
- 1 Session = 12半荘
- 各Sessionは3人分のGameResult、chip、participant noteを保持
- 4人のGroup PlayerからSessionごとに3人をローテーションしてfixtureを生成

## Historical benchmarks

各datasetについて3回ずつ計測した。

- monthly-history: 月別Session一覧 + participant note + chip
- performance-all: 通算成績
- performance-year: 年間成績
- performance-month: 月間成績
- session-games-12: 12半荘のGame / Result / Tag参照

## Historical measurement

当時は `npm run db:performance:preview` を実行し、以下を記録した。

- D1 `meta.duration` の平均/最大
- Wrangler CLI wall timeの平均/最大
- rows read
- fixture load wall time
- benchmark dataset件数

D1 server durationとCLI wall timeは分離した。CLI wall timeにはWrangler process startupとnetwork overheadが含まれるため、User-facing latencyの判定値には直接使用しない。

## Historical result

Final evidence run #36204733951 / PR #204:
- 5年相当 / 10年相当ともOverall PASS
- worst D1 server max: 39.00ms（10年相当 performance-all）
- Production D1へfixtureは投入していない

This result remains valid as historical evidence. It does **not** justify running the Preview benchmark again while remote D1 access is restricted.

## Current replacement

Use `23_PERFORMANCE_D1_TEST.md` for current testing.

Current layers:
1. local D1 fixture validation
2. local 5y / 10y benchmark
3. fixed query-count regression tests for Active Session / Games / Segments
4. optional dedicated remote Performance D1 only after quota availability is confirmed
5. smartphone felt-performance check after remote D1 / authentication is available

Issue #137 remains open only for the final smartphone felt-performance confirmation.
