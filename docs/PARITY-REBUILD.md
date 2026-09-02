# Precision Parity — 30 Cell Reconstruction

Precision Parity is now a single decision system built around **30 persistent cells**:

- 15 supported digit markets from the canonical Apex universe
- 2 cells per market: EVEN and ODD
- 30 total permanent cell identities

## Architecture

```text
Deriv shared tick bus
  -> canonical market ticks/digits
  -> engine council (each engine runs once per market)
  -> normalized evidence
  -> persistent EVEN + ODD cells
  -> suitability + maturity
  -> 30-cell ranking
  -> final arbitration
  -> downstream entry digit
  -> downstream parity replay
  -> final cell / no ready cell
  -> UI
```

## Cell model

Every cell owns its own:

- permanent identity
- observation count
- persistence
- support streak
- clean streak
- contradiction streak
- suitability score
- maturity score/stage
- supporting/opposing engine groups
- Sentinel read-only support
- entry state
- replay state

The model is deliberately borrowed from Sentinel's observation philosophy: a cell is a persistent hypothesis that develops over time rather than a transient score.

## Engine policy

The existing Precision Parity mathematics is retained under `src/lib/parity/engine-library/`.
The new `src/lib/parity/evidence/engine-runner.ts` is the only adapter that turns those engines into normalized evidence.

Engines do not emit final signals. They provide evidence or context.
Correlated engines are grouped before cell suitability is calculated.

## Hard blocks

The reconstruction deliberately does not treat every analytical warning as a fatal veto.
EV, entropy and drift warnings can reduce suitability or maturity. True hard blocks are reserved for data/feed integrity and explicit critical structural failures.

## Legacy cleanup

The previous multi-pipeline Precision Parity orchestration, old winner-first hook, old signal cards and duplicate radar UI are removed from the live route. Engine implementations that are still useful are retained as the engine library rather than as competing decision systems.
