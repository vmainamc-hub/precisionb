# Engineering Report — Single Authoritative Ranking & Panel Fault Isolation

## 1. Problem

The terminal presented more than one implicit ordering of the 90-cell universe.
The Apex page resolved its headline candidate through a fallback chain
(`top[0] → alertedLive → ranked[0]`), the qualified subset was produced by a
filter that could re-sort, and the execution lock re-sorted candidates before
locking. Three consequences followed:

1. "Rank #1" was not a stable identity — different panels could name different
   winners for the same scan.
2. Unqualified candidates were dropped from the population, so the true best
   observed cell could silently disappear and be replaced by a weaker one.
3. Execution eligibility (a downstream concern) was able to redefine an
   upstream ranking decision.

Separately, a single engine panel throwing (`undefined is not iterable`) blanked
the whole terminal.

## 2. Contract

There is exactly **one** ordering of the observed population and exactly **one**
Rank #1. Qualification and Stage 4 clearance are ranking *inputs* and
*annotations* — never a second ranking, never a filter applied before ranking.

Ranking hierarchy (highest authority first), implemented in
`src/lib/apex/final-rank.ts`:

1. Stage 4 final verdict precedence (`CLEARED > HELD_* > WAIT > BLOCKED`)
2. Mandatory RED structure integrity
3. Operator surface qualification
4. Number of operator gates passed
5. Digit-psychology score — chief authority among equals
6. Raw opportunity score
7. Stable deterministic key (`symbol:contract`)

No Sentinel mathematics is recomputed inside the ranker; every input is read.

## 3. Implementation

| Area | Change |
| --- | --- |
| `src/lib/apex/final-rank.ts` | `buildFinalRank()` ranks the whole observed population, re-stamps `rank` 1..N, and returns `FinalRankEntry[]` carrying the operator gate result, `qualified`, and `blockers`. |
| `src/lib/apex/scan.ts` | Returns `ranked` / `rankEntries`; `qualified` is a filtered subsequence of that one ranking; `leadCandidate` / `bestOf90` / `scan.best` are strictly `finalRank[0]`, reusing the same gate result that produced the rank. |
| `ScanResult` type | Exposes `finalRank` and `rankEntries`. |
| Apex page | Fallback chain removed. Rank #1 is `finalRank[0]`, rendered with its blockers when unqualified. Runner-up comparisons read `finalRank`, not the qualified subset. |
| `useStrongSignalLock` | No longer sorts. The incoming order *is* the ranking; the lock takes the first tradeable entry, so it may only lock or skip. |

## 4. Fault isolation

The page-blanking crash came from `DecisionSpinePanel` destructuring
`spine.lines` when absent. That is now guarded, and `profiles.ts`
(`ctx.engines`, bucket merges, dangerous digits), `engine-effectiveness.ts`
(`t.state?.engineVotes`), `simulator.ts` (`candidate.winners`) and `memory.ts`
(calibration) were hardened against partial or persisted-legacy data shapes.

A `PanelBoundary` component now wraps every engine panel and tab — verdict,
psychology, forward projection, simulator detail, simulator command centre,
governance, learning, 90-cell universe, entry lab, execution — so a single panel
fault reports itself instead of killing the terminal.

## 5. Verification

`src/lib/apex/final-rank.test.ts` encodes the contract as eight invariants:

1. One ranking containing every observed candidate exactly once.
2. Exactly one Rank #1.
3. An unqualified Rank #1 is still surfaced, with honest blockers.
4. Qualification never reorders — the qualified set is an in-order subsequence.
5. Determinism: identical inputs (in any input order) give an identical ranking.
6. Ranks are contiguous 1..N.
7. Population preserved — nothing is dropped for being unqualified.
8. The execution lock may only lock or skip; it cannot override Rank #1.

Full suite: **46 files, 454 tests, all passing.** Typecheck is clean.

## 6. Backend

The application schema was applied as a single consolidated migration
(profiles, roles via a separate `user_roles` table, Deriv accounts, trades,
preferences, auto-trade settings, the Apex market-state/sim-trade/signal/journal
tables, the Sentinel learning layer, and parity signals). Every table has
explicit grants, RLS enabled, and owner-scoped policies; the admin check lives
in a `private.has_role` security-definer function that is not exposed to the
Data API. Pooled, non-personal learning tables are readable and writable by any
signed-in user; nothing is readable anonymously.
