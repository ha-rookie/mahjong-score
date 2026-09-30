# ADR-0001: Persist actual Game placement separately from legacy result order

- Status: Proposed
- Date: 2026-10-01
- Decision Owners: Human
- Related Issue: #299
- Related Design IDs: DATA-001 / FUNC-003 / FUNC-006 / SCR-007

## Context

`game_results.rank` currently persists `Game.results` array order. It is not a score-derived Mahjong placement. The application now needs long-term Performance metrics such as hand win rate, and future analytics may need last-place rate and placement distribution.

Recomputing placement from every historical `score_point` row on every all-time Performance read would make read cost grow unnecessarily with accumulated history. At the same time, changing the meaning of the existing `rank` column would make historical data ambiguous and would conflict with its existing `UNIQUE(game_id, rank)` constraint when lower places tie.

Business rules for the stored final Score Point are:

- first place is unique; a first-place tie does not exist after the table's upper-seat / uma rule is applied
- lower places may tie
- last place may therefore be shared by multiple Players
- 3-player and 4-player Sessions must use the same semantics

## Decision Drivers

- Preserve all existing Production data and the legacy `rank` contract
- Keep all-time Performance reads cheap as 5-year / 10-year history grows
- Support lower-place ties and shared last place without magic-number ranks
- Make future last-place rate / placement distribution possible without re-reading every Game to infer meaning
- Keep Game creation and correction authoritative on the Worker rather than trusting client-computed placement
- Use additive D1 migration only; no reset, recreate, table replacement, or fixture replacement

## Options Considered

### Option A: Derive placement on every Performance read

Pros:

- No schema change
- No duplicated derived data

Cons:

- Every all-time read must group historical Game Results by Game and compare Score Point again
- Read work grows with total accumulated history
- Future placement/last-place analytics repeat the same derivation

### Option B: Overwrite or reinterpret existing `rank`

Pros:

- No new placement column

Cons:

- Breaks the existing meaning of `rank` as result-array order
- Historical `rank` values are not actual placements
- `UNIQUE(game_id, rank)` cannot represent `1,2,2` or `1,2,3,3`

### Option C: Add `placement` and `is_last`

Pros:

- Existing `rank` remains backward-compatible
- One small calculation at Game write/correction time makes later aggregate reads simple
- Lower-place ties and shared last place are explicit
- Future analytics can reuse the persisted facts

Cons:

- Requires additive Production migration and one-time historical backfill
- Derived values must be kept consistent when a Game is corrected

## Decision

Adopt Option C.

Add the following D1 columns to `game_results`:

```text
placement INTEGER NULL
is_last   INTEGER NOT NULL DEFAULT 0
```

`placement` is the score-derived competition placement:

```text
placement = number of Players with a strictly higher score_point + 1
```

Examples:

```text
3 players: +50, +10, -60      -> 1,2,3
3 players: +50, -25, -25      -> 1,2,2
4 players: +50, +10, +10,-70  -> 1,2,2,4
4 players: +50, +10, -30,-30  -> 1,2,3,3
4 players: +60, -20, -20,-20  -> 1,2,2,2
```

`is_last = 1` for every Player whose `score_point` equals the minimum Score Point in that Game. Therefore a last-place tie can have multiple `is_last = 1` rows.

The existing `rank` column remains the legacy result-array order and is not renamed, dropped, or reinterpreted by this change.

The Worker calculates `placement` / `is_last` from validated Score Points when a Game is created or corrected. The client does not submit authoritative placement values.

A valid Game must have exactly one `placement = 1`. A highest-Score-Point tie is rejected for new/corrected Games. Historical backfill must not guess a winner: if legacy data would produce multiple first-place rows, migration/validation fails and the anomaly is resolved before Production migration proceeds.

## Rationale

The write path handles only 3 or 4 Game Results, so deriving placement there is bounded and cheap. Performance reads already aggregate `game_results`; once placement is persisted, hand wins can be counted with a simple conditional aggregate instead of an additional per-Game maximum calculation across the full history.

Separating `is_last` from `placement` preserves the semantic distinction needed for cases such as `1,2,3,3`, where both Players at the minimum score are last-place ties even though the numeric placement is 3 rather than 4.

## Consequences

Positive:

- `gameFirstPlaceCount` can be aggregated with `placement = 1`
- future last-place rate can be aggregated with `is_last = 1`
- average score remains `SUM(score_point) / COUNT(*)`
- existing Production rows and legacy `rank` remain intact
- no additional Performance API request or N+1 query is needed

Negative / Trade-offs:

- Game correction must recompute and persist all affected placement fields atomically with the result replacement
- historical rows need one-time backfill in Local / Preview / Performance / Production
- `placement` remains nullable at the physical schema level because adding a later NOT NULL constraint in SQLite/D1 would require a table rebuild; post-migration validation and all new writes enforce non-null values instead

## Validation

- Migration safety guard accepts the additive migration
- Existing-data migration regression verifies row counts and original scores/chips/session data are unchanged
- Backfill verifies no `placement IS NULL` rows remain
- Every Game has exactly one `placement = 1`
- Every Game has at least one `is_last = 1`
- Unit tests cover 3-player/4-player normal placement, middle ties, last-place ties, and first-place-tie rejection
- Performance summary remains one aggregate query and exposes hand-first count plus Session-first count
- Existing 5-year / 10-year local Performance benchmark is rerun and compared with the current baseline
- Remote migration gate order is Local -> Preview -> Performance -> Production

## Revisit Condition

Revisit if the Mahjong scoring rule changes so the persisted final `score_point` can legitimately contain a first-place tie, or if a future ruleset requires seat-order information to resolve placement independently from final Score Point.
