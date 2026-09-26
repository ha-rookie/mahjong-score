# Performance D1 test environment

## Purpose
Validate the real Worker/API/React smartphone flow after roughly five years of accumulated Mahjong history without using Production or Preview D1.

## Isolation
- Worker: `mahjong-score-performance`
- D1: `mahjong-score-performance`
- D1 ID: `37b05ca8-9f6e-46b4-92be-7e02513cf044`
- Config: `wrangler.performance.jsonc`
- Base fixture group: `perf-realistic-5y`
- Production and Preview database names/IDs must not appear in the Performance config.

## Base fixture
Deterministic seed `1372026`.
- 260 finalized Sessions
- 3,120 Games
- 9,360 Game Results
- 4 Players rotating through 3-player Sessions
- 6-18 Games per Session while preserving exactly 3,120 total
- positive/negative scores with each Game totaling zero
- chip variation including zero-chip Sessions with each Session totaling zero
- note/no-note variation
- no active Session and no CRUD scratch data

The base fixture is retained. Do not clean it up after a test.

## Layers
1. CI local D1: generate, insert and validate the realistic fixture. No Cloudflare quota.
2. CI local benchmark: 5y/10y query regression benchmark. No Cloudflare quota.
3. Remote Performance D1: one-time 5y seed after daily quota availability is confirmed.
4. Smartphone: real Worker/API/React and LINE authentication.

## D1 read-cost regression rules
Database cost is part of performance. A fast response is not sufficient if the number of D1 reads grows through N+1 queries.

The normal read paths have these fixed data-query budgets. Authorization queries are separate from these data reads.

- Active Session: at most 4 data queries when an active Session exists: Session, participant notes, chips and current participants. The count must not grow with historical Session count.
- Games list: at most 3 data queries for a non-empty Session: Games, Game Results and Game Tags. The count must not grow with the number of Games. An empty Session does not issue child queries.
- Segments list: at most 2 data queries for a non-empty Session: Segments and Segment Players. The count must not grow with the number of Segments. An empty result does not issue the participant query.

These query-count invariants are enforced by Worker tests. Do not replace them with per-row or per-resource SELECT loops.

Wrangler local D1 does not currently expose `rows_read` / `rows_written` metadata in this benchmark environment. Run `36221346876` recorded `costMetricsAvailable: false`, so row-cost fields are intentionally reported as `n/a`. Do not invent local row-count thresholds or treat local timing as a prediction of remote D1 billing. If Wrangler exposes these fields in the future, the benchmark already records them.

## Local benchmark baseline
Run `36221346876`, 2026-09-26, local D1 only:

| Case | 5y median | 10y median | Expected scaling |
| --- | ---: | ---: | --- |
| Active Session lookup | 0 ms | 0 ms | bounded |
| Monthly history | 0 ms | 1 ms | bounded by month |
| All-time performance | 11 ms | 21 ms | may grow with total history |
| Year performance | 4 ms | 4 ms | bounded by year |
| Month performance | 1 ms | 1 ms | bounded by month |
| Session Games base query | 0 ms | 0 ms | bounded by one Session |

The 10-year fixture doubles the five-year history from 260 to 520 Sessions and from 3,120 to 6,240 Games. All-time aggregation therefore has more data to process; the other scoped reads should remain approximately bounded by their requested period/resource.

CLI wall time is not an application latency metric because each local benchmark invocation includes Wrangler startup overhead.

## Remote safety rules
- Never seed the base fixture into Production or Preview.
- Never run a bulk cleanup of the base fixture.
- The remote seed workflow requires the exact Performance database name and UUID.
- The seed workflow refuses to run if the base fixture already exists.
- Remote seed is manual-only and requires `SEED-PERFORMANCE-5Y`.
- Do not run migration or seed while the account is D1 quota-limited.
- Pull-request CI validates migrations locally and must not apply migrations to remote Preview D1.

## Smartphone CRUD scenario
After the base fixture exists:
1. Sign in with LINE to the Performance Worker.
2. Open the Performance group and confirm history, monthly, yearly and all-time views.
3. Start a new Session using three fixture Players.
4. Add several Games including positive and negative scores.
5. Correct one Game and verify aggregate changes.
6. Change chips and Session memo.
7. Delete one Game and verify history/aggregate changes.
8. Finalize the Session.
9. Re-open history and statistics.
10. Delete only the CRUD test Session through the normal authorized UI/API.
11. Confirm the 260-Session base fixture remains intact.

## Acceptance
- Major history/statistics displays normally target <=1s; repeated >2s is a failure signal.
- Active Session, Games and Segments read paths satisfy the fixed query-count budgets above.
- Five-year to ten-year growth does not reintroduce history-sized N+1 query counts.
- No timeout, broken layout, unusable scrolling, or graph failure at the five-year load.
- CRUD remains correct after long-term accumulation.
- No false stale/conflict message after successful update/delete.
- Production/Preview are untouched.

## LINE callback
The callback is origin-relative: `/api/auth/line/callback`. After the Performance Worker URL is known, add that exact Performance callback URL to the LINE Login channel before smartphone authentication. Do not weaken or bypass authentication for the performance test.
