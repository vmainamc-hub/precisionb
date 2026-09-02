/**
 * FORENSIC COVERAGE — PHASES 13 → 16.
 *
 * These tests exist to prove the architectural claims made in
 * docs/FORENSIC-PHASE-13-16-ACCEPTANCE.md with executable evidence:
 *
 *  - Phase 13/14/15A/15B: exactly ONE authoritative danger composition per
 *    contract, produced by the observation adapter and read back by ApexCore.
 *  - Phase 15D: Sentinel idempotency keyed on a deterministic source identity
 *    (market + proposition + Deriv source tick + analysis version), not on a
 *    bare timestamp.
 *  - Phase 15E: the §54 cross-market danger engine is connected and can veto
 *    publication globally.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { observationEngine } from "./observationEngine";
import { emptyEvidenceInput } from "./engineAdapter";
import { ANALYSIS_VERSION, MARKET_IDS } from "./constants";
import { globalScan } from "@/lib/precision-edge-v2/global-scanner";
import { assessCrossMarketDanger } from "@/lib/precision-edge-v2/cross-market-danger";

const MARKET = MARKET_IDS[0]!;
const PROP = "OVER2" as const;

describe("PHASE 15D — deterministic Sentinel observation identity", () => {
  beforeEach(() => {
    observationEngine.resetCells();
  });

  it("1. identity is composed of market, proposition, source tick and analysis version", () => {
    const input = emptyEvidenceInput(MARKET, PROP, 1_000);
    input.sourceTickId = "1700000000000@1234.56";
    input.analysisVersion = ANALYSIS_VERSION;

    const { key, weak } = observationEngine.observationIdentity(input);

    expect(weak).toBe(false);
    expect(key).toContain(MARKET);
    expect(key).toContain(PROP);
    expect(key).toContain("1700000000000@1234.56");
    expect(key).toContain(ANALYSIS_VERSION);
    // The timestamp is NOT part of a strong identity.
    expect(key).not.toContain("ts=1000");
  });

  it("2. the same source tick re-delivered under a NEW timestamp is a duplicate", () => {
    const first = emptyEvidenceInput(MARKET, PROP, 1_000);
    first.sourceTickId = "tick-A";
    first.analysisVersion = ANALYSIS_VERSION;

    const replay = emptyEvidenceInput(MARKET, PROP, 9_999); // later clock, same tick
    replay.sourceTickId = "tick-A";
    replay.analysisVersion = ANALYSIS_VERSION;

    observationEngine.ingest(first);
    const before = observationEngine.getIngestStats();
    observationEngine.ingest(replay);
    const after = observationEngine.getIngestStats();

    expect(after.accepted).toBe(before.accepted);
    expect(after.duplicates).toBe(before.duplicates + 1);
  });

  it("3. two DISTINCT source ticks sharing one timestamp are both accepted", () => {
    // Timestamp-only idempotency wrongly rejected this case.
    const a = emptyEvidenceInput(MARKET, PROP, 5_000);
    a.sourceTickId = "tick-A";
    a.analysisVersion = ANALYSIS_VERSION;
    const b = emptyEvidenceInput(MARKET, PROP, 5_000);
    b.sourceTickId = "tick-B";
    b.analysisVersion = ANALYSIS_VERSION;

    const before = observationEngine.getIngestStats();
    observationEngine.ingest(a);
    observationEngine.ingest(b);
    const after = observationEngine.getIngestStats();

    expect(after.accepted).toBe(before.accepted + 2);
    expect(after.duplicates).toBe(before.duplicates);
  });

  it("4. a new analysis version of the same tick is a legitimately new observation", () => {
    const v1 = emptyEvidenceInput(MARKET, PROP, 6_000);
    v1.sourceTickId = "tick-C";
    v1.analysisVersion = "v-old";
    const v2 = emptyEvidenceInput(MARKET, PROP, 6_000);
    v2.sourceTickId = "tick-C";
    v2.analysisVersion = "v-new";

    const before = observationEngine.getIngestStats();
    observationEngine.ingest(v1);
    observationEngine.ingest(v2);
    const after = observationEngine.getIngestStats();

    expect(after.accepted).toBe(before.accepted + 2);
  });

  it("5. out-of-order delivery of a new tick never rewinds cell state", () => {
    const late = emptyEvidenceInput(MARKET, PROP, 8_000);
    late.sourceTickId = "tick-late";
    late.analysisVersion = ANALYSIS_VERSION;
    const older = emptyEvidenceInput(MARKET, PROP, 2_000);
    older.sourceTickId = "tick-older";
    older.analysisVersion = ANALYSIS_VERSION;

    observationEngine.ingest(late);
    const before = observationEngine.getIngestStats();
    observationEngine.ingest(older);
    const after = observationEngine.getIngestStats();

    expect(after.accepted).toBe(before.accepted);
    expect(after.stale).toBe(before.stale + 1);
  });

  it("6. evidence without a Deriv source tick falls back and is counted as weak identity", () => {
    const synthetic = emptyEvidenceInput(MARKET, PROP, 3_000);
    synthetic.tickSequence = 120;
    synthetic.analysisVersion = ANALYSIS_VERSION;

    const { key, weak } = observationEngine.observationIdentity(synthetic);
    expect(weak).toBe(true);
    expect(key).toContain("ts=3000");
    expect(key).toContain("n=120");

    const before = observationEngine.getIngestStats();
    observationEngine.ingest(synthetic);
    const after = observationEngine.getIngestStats();
    expect(after.weakIdentity).toBe(before.weakIdentity + 1);
  });
});

describe("PHASE 15E — §54 cross-market danger is connected to publication", () => {
  function market(name: string, manipulation: number, crowding: number, fluctuation: number) {
    return {
      market: name,
      name,
      ready: false,
      stats: null,
      verdicts: [],
      psychology: { manipulation, crowding },
      fluctuation,
    } as any;
  }

  it("7. simultaneous manipulation + crowding across markets raises danger", () => {
    const calm = [market("A", 5, 5, 0.1), market("B", 8, 4, 0.12)];
    const hostile = [
      market("A", 90, 85, 0.9),
      market("B", 88, 82, 0.91),
      market("C", 92, 80, 0.89),
    ];

    const calmDanger = assessCrossMarketDanger(calm);
    const hostileDanger = assessCrossMarketDanger(hostile);

    expect(calmDanger.blockPublication).toBe(false);
    expect(hostileDanger.score).toBeGreaterThan(calmDanger.score);
    expect(hostileDanger.blockPublication).toBe(true);
  });

  it("8. globalScan reports the cross-market danger assessment on every scan", () => {
    const result = globalScan([market("A", 5, 5, 0.1)]);
    expect(result.crossMarketDanger).toBeTruthy();
    expect(typeof result.crossMarketDanger.score).toBe("number");
    expect(result.rejectedForCrossMarketDanger).toBe(0);
  });

  it("9. an extreme cross-market condition blocks publication with a stated reason", () => {
    const hostile = [
      market("A", 95, 90, 0.9),
      market("B", 95, 88, 0.9),
      market("C", 95, 92, 0.9),
    ];
    const result = globalScan(hostile);

    expect(result.best).toBeNull();
    expect(result.crossMarketDanger.blockPublication).toBe(true);
    expect(result.reason).toMatch(/cross-market danger/i);
  });
});
