# Parity Intelligence Architecture

## Purpose

`src/lib/parity-intelligence/` is an isolated, read-only intelligence subsystem beside the live Precision Parity application. It does not import into the live UI or signal path. It reuses existing Parity mathematics through adapters rather than reimplementing engines.

## Canonical flow

```text
Canonical market snapshot
        ↓
Existing Parity engines
        ↓
Normalized evidence
        ↓
Independent EVEN + ODD hypotheses
        ↓
Persistent cells
        ↓
Pure ranking
        ↓
Hard governance / qualification / admission
        ↓
Read-only Sentinel cross-confirmation
        ↓
Entry-digit validation
        ↓
DBot replay validation
        ↓
Immutable intelligence snapshot
```

## Critical invariant: no winner-first validation

Confluence may report a favoured side, but it is metadata/evidence only. It MUST NOT select the target for downstream directional validators. Target-specific engines are evaluated for both `BUY_EVEN` and `BUY_ODD`.

The current adapter therefore runs, independently for each parity:

- Particle filter
- Bootstrap/significance
- Danger/threat analysis
- Entry timing
- EV gate

The drift detector is a market-level two-sided structural-break detector and is evaluated once in its namespaced memory.

Statistical, Markov, and pattern evidence is also normalized as separate EVEN and ODD readings from the same underlying engine output. The legacy `dominantSide` field is never used to suppress the losing hypothesis.

## Cell invariants

There are exactly two persistent cells per market:

- `${marketId}_EVEN`
- `${marketId}_ODD`

Each cell owns its own persistence, maturity, support/conflict, contradiction, veto streak, history and evidence trace. Duplicate and out-of-order observations do not advance the cell.

## Ranking vs qualification vs admission

These are deliberately separate:

1. **Ranking:** identifies the strongest developing hypothesis. A blocked #1 remains visible.
2. **Qualification:** determines whether the hypothesis has enough persistence and evidence.
3. **Admission:** applies hard governance, Sentinel confirmation, entry-digit readiness and soft-blocker load.

A high score cannot override a hard veto.

## Sentinel bridge

Sentinel is consumed read-only. No Sentinel ingestion occurs here. Parity is inferred from the actual Sentinel winning-digit composition and permanent identity fields; `OVER = EVEN` and `UNDER = ODD` assumptions are forbidden.

Sentinel confirmation is directional: confirmation of EVEN cannot admit ODD, and an opposing Sentinel parity can block the candidate cell.

## Entry digit and DBot

Entry-digit evaluation is strictly downstream of a qualified direction. The local replay validator models the DBot cadence as `OPEN → SETTLE → OPEN → SETTLE`; a settlement tick is consumed and cannot become the next opening tick. The validator is an isolated deterministic implementation point and can later be replaced by the real DBot bridge without changing cell/governance contracts.

## Engine roles

Existing engines are classified as direct evidence, meta/validation, governance/gates, context, entry or infrastructure. Engines are not treated as equal votes. Correlated evidence is attenuated through correlation groups so multiple views of the same phenomenon cannot manufacture confidence.

## Integration rule

No file under this subsystem should be imported into the live application until the isolated test suite, full repository test suite, typecheck, production build and shadow comparison are green. Live behavior must remain unchanged during this phase.
