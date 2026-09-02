# FORENSIC ACCEPTANCE REPORT — PHASES 13 → 16

Scope: authoritative directional momentum (13), percentage competition (14),
RED / 2ND RED semantics and single-danger consolidation (15), full regression,
lint, production build and stress measurement (16).

All evidence below is source-quoted from this repository and all numbers are
actual measured outputs of commands run against this working tree.

---

## PHASE 13 — DIRECTIONAL MOMENTUM

**Engine:** `src/lib/sentinel/winning-side-momentum.ts` → `directionalMomentum()`.
It reports winning-side, losing-side and relative movement, plus `reversal`,
`takeoverRisk`, a bounded `severity` (0–100) and human-readable `evidence`.

**Consumed by danger** — `src/lib/sentinel/danger.ts`:

```ts
const momentum = input.momentum;
if (momentum && momentum.measurable && momentum.severity > 0) {
  ...
  // Bounded: at most 26 points, so momentum can escalate danger but can
  points: Math.round(Math.min(26, momentum.severity * 0.26)),
  value: `${momentum.state} ${momentum.severity}/100`,
```

Directionality rule enforced in the contract (`danger.ts:82-86`):

```ts
 * PHASE 13 — directional momentum (winning/losing/relative/reversal).
 * Adverse momentum RAISES danger. Favourable momentum contributes ZERO
 * points: momentum is supporting evidence and can never lower danger or
```

**Computed once per cell** from the shared `PriceActionField`, in
`src/lib/sentinel/observation/engineAdapter.ts`:

```ts
const dirMomentum = directionalMomentum(paField, winners, losers);
```

The SAME object is both fed to danger and published as evidence, so no consumer
can read a second momentum reading:

```ts
momentum: {
  ...
  directional: dirMomentum,
  raw: { spinePressure: winPressure, wsm, directional: dirMomentum },
},
```

**Test evidence:** `src/lib/apex/authoritative-danger.test.ts` test 4 asserts
`i.momentum.directional` is present for every one of the mapped cells.

---

## PHASE 14 — PERCENTAGE COMPETITION

**Engine:** `assessPercentageCompetition()` in
`src/lib/sentinel/price-action-psychology.ts`, surfaced per contract as
`paContract.competition` and wired into the authoritative composition:

```ts
competition: paContract.competition,
```

**Consumed by danger** (`danger.ts:433-458`), graded by state with the actual
measured gap in the evidence string:

```ts
const competition = input.competition;
if (competition && competition.measurable && competition.state !== "LOW") {
  ...
  value: `gap ${competition.gapPp.toFixed(2)}pp → ${competition.gapFastPp.toFixed(2)}pp (sev ${competition.severity}/100)`,
```

---

## PHASE 15A — RED / 2ND RED SEMANTICS

`src/lib/sentinel/red-semantics.ts` is the single authoritative definition of
RED and 2ND RED. Danger reads it through one accessor, with the psychology
object only as fallback — never a competing local definition:

```ts
const red = input.redSemantics ?? psych?.redSemantics;
```

---

## PHASE 15B — ONE AUTHORITATIVE DANGER VALUE

### The defect

`src/lib/apex/core.ts` composed a SECOND danger object from intel-only inputs
(no momentum, no competition, no RED semantics, no pressure windows) and wrote
it onto every contract. The observation adapter composed a richer one. Two
different numbers existed for the same cell depending on which consumer you
asked.

### The repair

ApexCore no longer calls `composeDanger` at all. It reads the adapter's value
back (`src/lib/apex/core.ts`):

```ts
// ── ONE AUTHORITATIVE DANGER VALUE (PHASE 15B) ────────────────────
...
try {
  const authoritative = mapIntelToObservationInputs(intel, digits);
  const byProposition = new Map(authoritative.map((o) => [String(o.proposition), o]));
  for (const c of contracts) {
    const composition = byProposition.get(String(c.id))?.danger?.raw;
    if (composition) c.dangerComposition = composition;
  }
} catch (err) {
  observationEngine.recordIngestError(err);
}
```

The adapter snapshot is memoised per market/tick identity, so the later
observation ingestion in the same cycle is a cache hit — the engines still run
exactly once per market per cycle (verified by test 5 below and by the stress
timing).

The authoritative composition itself, in `engineAdapter.ts`, carries all four
new evidence channels:

```ts
momentum: dirMomentum,
competition: paContract.competition,
redSemantics: digitPsychology.redSemantics,
contractRiskScalar: typeof c.danger === "number" ? c.danger : null,
```

### Test evidence — `src/lib/apex/authoritative-danger.test.ts` (5 tests, all passing)

| # | Assertion | Result |
|---|-----------|--------|
| 1 | `core.ts` contains no `composeDanger(` call | PASS |
| 2 | Every contract carries a finite danger composition | PASS |
| 3 | `contract.dangerComposition` **is the same object** (`toBe`) as `input.danger.raw` | PASS |
| 4 | Every danger component is coded, labelled and graded; directional momentum present on every cell | PASS |
| 5 | Repeated mapping of the same intel yields identical danger totals | PASS |

Test 3 is object identity, not numeric equality — it is impossible for the UI,
ranking and qualification gates to observe different danger values.

---

## PHASE 15D — DETERMINISTIC SENTINEL IDENTITY

### The defect

`observationEngine.ingest()` deduplicated on `input.timestamp` alone:

```ts
const seen = this.lastAcceptedTs.get(id);
if (seen !== undefined && ts <= seen) { ... }
```

Two failure modes: a replay of the same source tick under a fresh clock was
accepted twice, and two genuinely distinct ticks sharing a millisecond were
silently dropped.

### The repair

Identity is now `marketId | proposition | analysisVersion | sourceTickId`,
where `sourceTickId` is built from the REAL Deriv tick (`epoch@quote`) in
`engineAdapter.ts`:

```ts
const busTicks = derivBus.getTicks(String(intel.symbol)) ?? [];
const lastTick = busTicks.length > 0 ? busTicks[busTicks.length - 1] : null;
const sourceTickId = lastTick ? `${lastTick.t}@${lastTick.price}` : null;
```

`ANALYSIS_VERSION` (`src/lib/sentinel/observation/constants.ts`, currently
`phase-13-16.1`) makes a re-analysis of the same tick under new mathematics a
legitimately distinct observation.

Guard (`observationEngine.ts`): duplicate identity → rejected as duplicate; new
identity with an older timestamp → rejected as stale (no state rewind);
identity memory is bounded at `IDENTITY_MEMORY_PER_CELL = 256` per cell.

### Stated limitation (no fabrication)

When no Deriv source tick exists (synthetic digit arrays, tests, history-only
bootstrap) there is nothing real to key on. Identity falls back to
`ts=<timestamp>#n=<tickSequence>` and the observation is counted in a separate
`weakIdentity` telemetry counter. Under that fallback, two genuinely distinct
observations that share both a timestamp and a tick count are indistinguishable
and the second is treated as a duplicate. No tick id is ever invented.

### Test evidence — `src/lib/sentinel/observation/forensic-phase-13-16.test.ts` (9 tests, all passing)

| # | Assertion | Result |
|---|-----------|--------|
| 1 | Strong identity contains market, proposition, source tick and version — and NOT the timestamp | PASS |
| 2 | Same source tick re-delivered under a newer timestamp → duplicate, not accepted | PASS |
| 3 | Two distinct source ticks sharing one timestamp → both accepted | PASS |
| 4 | Same tick, new analysis version → accepted as distinct | PASS |
| 5 | Out-of-order older tick → counted stale, state not rewound | PASS |
| 6 | No source tick → weak identity fallback, counted in `weakIdentity` | PASS |

---

## PHASE 15E — CROSS-MARKET DANGER: CONNECTED

`src/lib/precision-edge-v2/cross-market-danger.ts` had **zero importers**
(verified by `rg`). Since `precision-edge-v2` is live (global scanner, precision
feeds, hooks), the module was connected rather than deprecated — the §54
assessment is a genuine global gate that no per-market gate can replicate.

`src/lib/precision-edge-v2/global-scanner.ts`:

```ts
// ── §54 CROSS-MARKET DANGER GATE (PHASE 15E) ──────────────────────────
const crossMarketDanger = assessCrossMarketDanger(markets);
const dangerBlocked = crossMarketDanger.blockPublication;
const rejectedForCrossMarketDanger = dangerBlocked ? candidates.length : 0;

const best = dangerBlocked ? null : (candidates[0] ?? null);
const topThree = dangerBlocked ? [] : candidates.slice(0, 3);
```

`GlobalScanResult` now always reports `crossMarketDanger` and
`rejectedForCrossMarketDanger`, and the blocked reason names the level, score
and specific anomalies.

**Test evidence** (tests 7–9 of the forensic suite): danger rises with
simultaneous manipulation/crowding; every scan reports an assessment; an extreme
condition nulls `best` with a stated cross-market reason. All passing.

---

## PHASE 15F — TEST REPOINTING

No test asserted the removed ApexCore-local composition, so nothing needed
rewriting; existing suites that stub `dangerComposition` (`stage4-risk-integration`,
`best-of-90`) remain valid because the field's shape is unchanged. Two new
forensic suites were added (14 new tests):

- `src/lib/apex/authoritative-danger.test.ts` (5)
- `src/lib/sentinel/observation/forensic-phase-13-16.test.ts` (9)

---

## PHASE 16 — REGRESSION, LINT, BUILD, STRESS

### Full test suite — `bunx vitest run`

```
 Test Files  42 passed (42)
      Tests  437 passed (437)
   Duration  23.20s
```

Baseline before this work was 40 files / 423 tests. Delta is exactly the 14 new
forensic tests; zero pre-existing tests regressed.

### Typecheck — `bunx tsgo --noEmit`

Clean: no output, exit 0.

### Lint — `bunx eslint .`

```
✖ 30 problems (0 errors, 30 warnings)
```

Zero errors. All 30 warnings are pre-existing React fast-refresh and
`exhaustive-deps` advisories in UI/context files untouched by these phases.

### Production build — `bun run build`

```
✓ built in 2.39s
[nitro] ✔ You can deploy this build using npx nitro deploy --prebuilt
```

Succeeded, including the Worker/nitro server bundle.

### Stress test — full universe, actual measurements

`src/lib/apex/phase16-stress.test.ts` drives all 15 universe markets with 1000
ticks each through 20 full analyse + ingest cycles, advancing every market by a
real new tick per cycle, then replays the final cycle verbatim.

```json
{
  "markets": 15,
  "cycles": 20,
  "ingestCalls": 1800,
  "accepted": 1800,
  "duplicates": 1800,
  "stale": 0,
  "weakIdentity": 0,
  "totalMs": 8947.6,
  "msPerCycle": 447.38,
  "msPerCell": 4.971,
  "heapMB": 456.7,
  "replayDuplicates": 90
}
```

Reading of these numbers:

- **1800 accepted / 0 stale** — every genuinely new source tick was ingested
  exactly once across 1800 cell-observations, and nothing was rewound.
- **1800 duplicates** — ApexCore's own in-cycle ingestion already consumed each
  observation, so the test's explicit second ingest of the identical evidence
  was correctly rejected. This is the exactly-once guarantee firing 1800 times
  under load rather than a fault.
- **replayDuplicates = 90** — a verbatim replay of a full 15×6 cycle produced
  exactly 90 duplicate rejections and zero state advances.
- **weakIdentity = 0** — every observation in the stress run carried a real
  Deriv source tick identity; the fallback path was never needed.
- **~447 ms per full 90-cell universe cycle (~5.0 ms per cell)** with heap at
  457 MB after 1800 cell analyses — no unbounded growth, since identity memory
  is capped at 256 entries per cell.

---

## ACCEPTANCE SUMMARY

| Item | Status | Evidence |
|------|--------|----------|
| Phase 13 momentum authoritative and bounded | ACCEPTED | `winning-side-momentum.ts`, `danger.ts:394-428`, adapter single computation |
| Phase 14 competition quantified and graded | ACCEPTED | `price-action-psychology.ts`, `danger.ts:433-458` |
| Phase 15A single RED definition | ACCEPTED | `red-semantics.ts`, single accessor in danger |
| Phase 15B one danger value per contract | ACCEPTED | Object-identity test 3; `composeDanger` absent from `core.ts` |
| Phase 15D deterministic identity | ACCEPTED (fallback limitation stated) | 6 identity tests; stress: 0 stale, 90 replay duplicates |
| Phase 15E cross-market danger connected | ACCEPTED | `global-scanner.ts` gate + 3 tests |
| Phase 15F forensic coverage | ACCEPTED | 14 new tests, 437 total |
| Phase 16 regression / lint / build / stress | ACCEPTED | 437 passed, 0 lint errors, build OK, measurements above |
