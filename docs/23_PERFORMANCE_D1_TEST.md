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

## Remote safety rules
- Never seed the base fixture into Production or Preview.
- Never run a bulk cleanup of the base fixture.
- The remote seed workflow requires the exact Performance database name and UUID.
- The seed workflow refuses to run if the base fixture already exists.
- Remote seed is manual-only and requires `SEED-PERFORMANCE-5Y`.
- Do not run migration or seed while the account is D1 quota-limited.

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
- No timeout, broken layout, unusable scrolling, or graph failure at the five-year load.
- CRUD remains correct after long-term accumulation.
- No false stale/conflict message after successful update/delete.
- Production/Preview are untouched.

## LINE callback
The callback is origin-relative: `/api/auth/line/callback`. After the Performance Worker URL is known, add that exact Performance callback URL to the LINE Login channel before smartphone authentication. Do not weaken or bypass authentication for the performance test.
