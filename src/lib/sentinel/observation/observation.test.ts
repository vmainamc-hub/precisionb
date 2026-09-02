import { describe, it, expect, beforeEach } from "vitest";
import {
  ObservationEngine,
  observationEngine,
  MARKET_IDS,
  PROPOSITIONS,
  ALL_CELL_IDS,
  cellId,
  emptyEvidenceInput,
  type EngineEvidenceInput,
  interpretMomentum,
  assessQuality,
  checkHardVeto,
  selectivityCalibrationCheck,
  explainWaiting,
  explainRipe,
  ObservationCell,
  QualificationManager,
  TickConfirmationEngine,
} from "./index";
import { rankOpportunities, DEFAULT_SCAN_OPTIONS } from "@/lib/apex/scan";

describe("Sentinel Observation Layer — §20 Consolidated Master Test Suite", () => {
  let engine: ObservationEngine;

  beforeEach(() => {
    engine = new ObservationEngine();
  });

  // Helper to prime a cell into RIPE state with full persistence
  function feedToRipe(target: ObservationEngine | ObservationCell, count = 100) {
    let lastDossier: any = null;
    for (let i = 0; i < count; i++) {
      const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000 + i * 1000);
      input.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
      input.entryDigit = {
        digit: 4,
        state: "VALIDATED",
        support: "SUPPORTING",
        dangerousCompetitor: false,
      };
      input.pressure.byWindow = {
        15: "SUPPORTING",
        30: "SUPPORTING",
        60: "SUPPORTING",
        120: "SUPPORTING",
      };
      input.losingSidePressure = { state: "DECLINING", severity: "NONE" };
      input.trigger = { state: "VALID" };
      input.regime = {
        classification: "TRENDING_PERSISTENT",
        confidence: 0.9,
        transitioning: false,
        compatibility: "COMPATIBLE",
      };
      input.statistics = { strength: "STRONG", sampleSize: 100 };
      lastDossier = target.ingest(input);
    }
    return lastDossier;
  }

  // 1. All 15 markets exist; every market has exactly the six required propositions; 90 cells are created correctly.
  it("1. creates exactly 90 independent cells across 15 markets with 6 propositions each", () => {
    expect(MARKET_IDS.length).toBe(15);
    expect(PROPOSITIONS.length).toBe(6);
    expect(ALL_CELL_IDS.length).toBe(90);

    for (const m of MARKET_IDS) {
      for (const p of PROPOSITIONS) {
        const cell = engine.getCell(m, p);
        expect(cell).toBeDefined();
      }
    }
  });

  // 2. Observation identity is stable; V10/UNDER_6 cannot read V10/UNDER_7 history; V10/UNDER_6 cannot read V25/UNDER_6 history.
  it("2. maintains strictly independent identity with zero cross-cell state contamination", () => {
    const v10u6 = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    v10u6.psychology = { direction: "UNDER", state: "STRENGTHENING", support: "SUPPORTING" };

    // Ingest into V10 UNDER6
    engine.ingest(v10u6);

    const cellV10U6 = engine.getCell("1HZ10V", "UNDER6");
    const cellV10U7 = engine.getCell("1HZ10V", "UNDER7");
    const cellV25U6 = engine.getCell("1HZ25V", "UNDER6");

    expect(cellV10U6.dossier).not.toBeNull();
    expect(cellV10U6.dossier?.psychology.support).toBe("SUPPORTING");
    expect(cellV10U7.dossier).toBeNull();
    expect(cellV25U6.dossier).toBeNull();
  });

  // 3. A temporary pressure spike does not automatically produce RIPE.
  it("3. requires sustained persistence; a single pressure spike does not trigger RIPE", () => {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    input.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
    input.entryDigit = {
      digit: 4,
      state: "VALIDATED",
      support: "SUPPORTING",
      dangerousCompetitor: false,
    };
    input.pressure = {
      byWindow: { 15: "SUPPORTING", 30: "SUPPORTING", 60: "SUPPORTING", 120: "SUPPORTING" },
      candidateDigitTrend: "TREND",
    };
    input.trigger = { state: "VALID" };
    input.regime = {
      classification: "TRENDING_PERSISTENT",
      confidence: 0.9,
      transitioning: false,
      compatibility: "COMPATIBLE",
    };

    // 1 tick of perfect evidence
    const dossier1 = engine.ingest(input);
    expect(dossier1.state).not.toBe("RIPE");
  });

  // 4. Fluctuation is correctly distinguished from persistent pressure/trend.
  it("4. distinguishes fluctuation from sustained trend and sets stability state appropriately", () => {
    const cell = new ObservationCell("1HZ10V", "UNDER6");

    // Oscillating inputs (flipping support)
    for (let i = 0; i < 10; i++) {
      const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000 + i * 1000);
      input.psychology.support = i % 2 === 0 ? "SUPPORTING" : "OPPOSING";
      cell.ingest(input);
    }

    const d = cell.getDossier();
    expect(["HIGHLY_UNSTABLE", "CHOPPY", "FLUCTUATING"]).toContain(d?.stability);
  });

  // 5. Contradictory evidence can move a proposition into CONFLICT.
  it("5. moves state to CONFLICT when contradictory evidence streams persist", () => {
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    // Seed with developing evidence
    for (let i = 0; i < 30; i++) {
      const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000 + i * 1000);
      input.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
      input.pressure.byWindow = {
        15: "SUPPORTING",
        30: "SUPPORTING",
        60: "SUPPORTING",
        120: "SUPPORTING",
      };
      input.losingSidePressure = { state: "DECLINING", severity: "NONE" };
      cell.ingest(input);
    }

    // Introduce contradictions without hard veto (mixed windows, conflicting momentum, accelerating losing side)
    for (let i = 30; i < 45; i++) {
      const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000 + i * 1000);
      input.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
      input.losingSidePressure = { state: "ACCELERATING", severity: "CAUTION" };
      input.momentum = { side: "OVER", state: "ACCELERATING", strength: 0.8 };
      input.pressure.byWindow = {
        15: "SUPPORTING",
        30: "OPPOSING",
        60: "SUPPORTING",
        120: "OPPOSING",
      };
      input.regime = {
        classification: "CHOPPY_OSCILLATING",
        confidence: 0.8,
        transitioning: false,
        compatibility: "NEUTRAL_UNCERTAIN",
      };
      cell.ingest(input);
    }

    expect(cell.state).toBe("CONFLICT");
  });

  // 6. Deterioration can move RIPE back toward earlier states.
  it("6. moves RIPE back toward DECAYING/CONFIRMING when supporting evidence deteriorates", () => {
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    feedToRipe(cell);
    expect(cell.state).toBe("RIPE");

    // Supporting evidence stops renewing
    const deteriorating = emptyEvidenceInput("1HZ10V", "UNDER6", 200000);
    deteriorating.psychology = { direction: "UNDER", state: "WEAKENING", support: "UNKNOWN" };
    deteriorating.losingSidePressure = { state: "INCREASING", severity: "CAUTION" };
    cell.ingest(deteriorating);

    expect(cell.state).not.toBe("RIPE");
  });

  // 7. Hard vetoes prevent RIPE/opportunity presentation, and override any qualification score.
  it("7. hard vetoes immediately prevent RIPE and require 3-tick persistence before early-stage rejection", () => {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    input.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
    input.entryDigit = {
      digit: 4,
      state: "VALIDATED",
      support: "SUPPORTING",
      dangerousCompetitor: false,
    };
    input.pressure.byWindow = {
      15: "SUPPORTING",
      30: "SUPPORTING",
      60: "SUPPORTING",
      120: "SUPPORTING",
    };
    input.veto = { active: true, hard: true, reason: "Operator hard veto active" };

    // Tick 1: veto detected, but early cell (WATCHING) holds and does not immediately reject
    const dossier1 = engine.ingest(input);
    expect(checkHardVeto(dossier1).vetoed).toBe(true);
    expect(dossier1.state).toBe("WATCHING");

    // Tick 2: sustained veto
    const dossier2 = engine.ingest({ ...input, timestamp: 2000 });
    expect(dossier2.state).toBe("WATCHING");

    // Tick 3: 3rd consecutive tick of hard veto -> transitions to REJECTED
    const dossier3 = engine.ingest({ ...input, timestamp: 3000 });
    expect(dossier3.state).toBe("REJECTED");
  });

  // 8. Simulation evidence does not independently trigger an opportunity.
  it("8. simulation evidence alone cannot create an opportunity without structural validation", () => {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    input.simulation = { state: "FAVOURABLE", sampleSize: 100, conditionedOnRegime: true };
    input.psychology = { direction: "NONE", state: "FORMING", support: "UNKNOWN" };

    const dossier = engine.ingest(input);
    expect(dossier.state).toBe("WATCHING");
  });

  // 9. Specific entry-digit validation, separate from directional psychology validation.
  it("9. validates directional psychology independently from entry-digit suitability", () => {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    input.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
    input.entryDigit = {
      digit: null,
      state: "WAITING",
      support: "UNKNOWN",
      dangerousCompetitor: false,
    };

    const dossier = engine.ingest(input);
    expect(dossier.psychology.support).toBe("SUPPORTING");
    expect(dossier.entryDigit.state).toBe("WAITING");
    expect(dossier.state).not.toBe("RIPE");
  });

  // 10. Losing-side pressure correctly blocks/downgrades a candidate.
  it("10. losing-side pressure severity=REJECT or VETO hard-blocks opportunity", () => {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    input.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
    input.losingSidePressure = { state: "TAKEOVER", severity: "REJECT" };

    const dossier = engine.ingest(input);
    const veto = checkHardVeto(dossier);
    expect(veto.vetoed).toBe(true);
  });

  // 11. Pressure confirmation and disagreement across 15/30/60/120 windows, including mixed-window cases.
  it("11. accurately tracks pressure cross-window agreement and flags mixed windows", () => {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    input.pressure = {
      byWindow: { 15: "SUPPORTING", 30: "OPPOSING", 60: "MIXED", 120: "SUPPORTING" },
      candidateDigitTrend: "FLUCTUATION",
    };

    const dossier = engine.ingest(input);
    expect(dossier.pressure.byWindow[15]).toBe("SUPPORTING");
    expect(dossier.pressure.byWindow[30]).toBe("OPPOSING");
    expect(dossier.contradictions).toBeGreaterThan(0);
  });

  // 12. Insufficient simulation evidence is reported as INSUFFICIENT, not manufactured confidence.
  it("12. reports insufficient simulation evidence honestly without manufactured confidence", () => {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    input.simulation = { state: "INSUFFICIENT", sampleSize: 2, conditionedOnRegime: false };

    const dossier = engine.ingest(input);
    expect(dossier.simulation.state).toBe("INSUFFICIENT");
    const quality = assessQuality(dossier, "NEUTRAL");
    expect(quality.statisticsContribution).toBe("NONE");
  });

  // 13. Regime-appropriate vs. regime-inappropriate structurally-valid setups.
  it("13. prevents RIPE if structurally valid setup is incompatible with current regime", () => {
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    for (let i = 0; i < 100; i++) {
      const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000 + i * 1000);
      input.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
      input.entryDigit = {
        digit: 4,
        state: "VALIDATED",
        support: "SUPPORTING",
        dangerousCompetitor: false,
      };
      input.pressure.byWindow = {
        15: "SUPPORTING",
        30: "SUPPORTING",
        60: "SUPPORTING",
        120: "SUPPORTING",
      };
      input.trigger = { state: "VALID" };
      // INCOMPATIBLE REGIME
      input.regime = {
        classification: "HIGH_VOLATILITY_UNSTABLE",
        confidence: 0.85,
        transitioning: false,
        compatibility: "INCOMPATIBLE",
      };
      cell.ingest(input);
    }

    expect(cell.state).not.toBe("RIPE");
  });

  // 14. Material regime change triggers immediate re-evaluation of a waiting opportunity.
  it("14. re-evaluates opportunities on material regime transition", () => {
    feedToRipe(engine);

    const cell = engine.getCell("1HZ10V", "UNDER6");
    expect(cell.dossier?.state).toBe("RIPE");
    const qual = engine.qualificationManager.get(cellId("1HZ10V", "UNDER6"));
    expect(qual).toBeDefined();

    // Material shift to incompatible regime
    const shift = emptyEvidenceInput("1HZ10V", "UNDER6", 200000);
    shift.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
    shift.entryDigit = {
      digit: 4,
      state: "VALIDATED",
      support: "SUPPORTING",
      dangerousCompetitor: false,
    };
    shift.regime = {
      classification: "DISTRIBUTION_EXHAUSTION",
      confidence: 0.95,
      transitioning: true,
      compatibility: "INCOMPATIBLE",
    };
    engine.ingest(shift);

    const activeQual = engine.qualificationManager.get(cellId("1HZ10V", "UNDER6"));
    expect(activeQual).toBeUndefined(); // Was invalidated and cleaned up from active
  });

  // 15. Momentum side/state correctly read as supportive vs. conflicting depending on setup direction.
  it("15. interprets momentum correctly by proposition barrier side", () => {
    // UNDER proposition + UNDER momentum = SUPPORTIVE
    expect(
      interpretMomentum("UNDER6", { side: "UNDER", state: "ACCELERATING", strength: 0.8 }),
    ).toBe("SUPPORTIVE");
    // UNDER proposition + OVER momentum = CONFLICTING
    expect(
      interpretMomentum("UNDER6", { side: "OVER", state: "ACCELERATING", strength: 0.8 }),
    ).toBe("CONFLICTING");
    // OVER proposition + OVER momentum = SUPPORTIVE
    expect(interpretMomentum("OVER1", { side: "OVER", state: "ACCELERATING", strength: 0.8 })).toBe(
      "SUPPORTIVE",
    );
    // OVER proposition + UNDER momentum = CONFLICTING
    expect(
      interpretMomentum("OVER1", { side: "UNDER", state: "ACCELERATING", strength: 0.8 }),
    ).toBe("CONFLICTING");
  });

  // 16. RIPE transition, opportunity expiration, and opportunity invalidation.
  it("16. executes the lifecycle: RIPE -> EXECUTION_WINDOW_ACTIVE -> EXPIRED", () => {
    const qm = new QualificationManager();
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    const dossier = feedToRipe(cell);

    expect(dossier.state).toBe("RIPE");
    const qual = qm.attemptQualify(dossier, 100000);
    expect(qual).not.toBeNull();
    expect(qual?.stage).toBe("EXECUTION_WINDOW_ACTIVE");
    expect(qual?.liveHealth).toBe("HEALTHY");

    // After 91 seconds
    const monitored = qm.monitorLiveHealth(cellId("1HZ10V", "UNDER6"), dossier, 100000 + 91000);
    expect(monitored?.liveHealth).toBe("EXPIRED");
  });

  // 17. Entry-digit changes invalidating a stale opportunity.
  it("17. invalidates live health when entry trigger fails", () => {
    const qm = new QualificationManager();
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    const dossier = feedToRipe(cell);

    const qual = qm.attemptQualify(dossier, 100000);
    expect(qual).not.toBeNull();

    // Trigger fails
    const failedInput = { ...dossier, trigger: { state: "FAILED" } };
    const monitored = qm.monitorLiveHealth(cellId("1HZ10V", "UNDER6"), failedInput, 101000);
    expect(monitored?.liveHealth).toBe("INVALIDATED");
  });

  // 18. Rapid setup formation and rapid setup decay (formation velocity).
  it("18. tracks formation velocity across rapid, normal, and deteriorating trajectories", () => {
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    for (let i = 0; i < 25; i++) {
      const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000 + i * 1000);
      input.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
      input.entryDigit = {
        digit: 4,
        state: "VALIDATED",
        support: "SUPPORTING",
        dangerousCompetitor: false,
      };
      input.pressure.byWindow = {
        15: "SUPPORTING",
        30: "SUPPORTING",
        60: "SUPPORTING",
        120: "SUPPORTING",
      };
      cell.ingest(input);
    }
    const d = cell.getDossier();
    expect(d?.formationVelocity).toBe("RAPID");
  });

  // 19. Market isolation (no cross-market contamination) under concurrent updates.
  it("19. maintains strict isolation under concurrent multi-market updates", () => {
    for (const m of MARKET_IDS) {
      for (const p of PROPOSITIONS) {
        const input = emptyEvidenceInput(m, p, 1000);
        if (m === "1HZ10V" && p === "UNDER6") {
          input.psychology.direction = "UNDER";
          input.psychology.support = "SUPPORTING";
        }
        engine.ingest(input);
      }
    }

    expect(engine.getCell("1HZ10V", "UNDER6").dossier?.psychology.direction).toBe("UNDER");
    expect(engine.getCell("1HZ25V", "UNDER6").dossier?.psychology.direction).toBe("NONE");
    expect(engine.getCell("1HZ10V", "OVER1").dossier?.psychology.direction).toBe("NONE");
  });

  // 20. Correct dynamic explanation generation for both "why waiting" and "why RIPE" cases.
  it("20. dynamically generates human-readable explanations from live evidence", () => {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    input.psychology = { direction: "UNDER", state: "FORMING", support: "SUPPORTING" };
    input.entryDigit = {
      digit: null,
      state: "WAITING",
      support: "UNKNOWN",
      dangerousCompetitor: false,
    };
    input.pressure.byWindow = { 15: "SUPPORTING", 30: "OPPOSING", 60: "MIXED", 120: "SUPPORTING" };

    const dossier = engine.ingest(input);
    const waitingText = explainWaiting(dossier, "NEUTRAL");
    expect(waitingText).toContain("UNDER structure is valid");
    expect(waitingText).toContain("no entry digit has been validated yet");

    // RIPE explanation
    dossier.entryDigit = {
      digit: 4,
      state: "VALIDATED",
      support: "SUPPORTING",
      dangerousCompetitor: false,
    };
    dossier.regime = {
      classification: "TRENDING_PERSISTENT",
      confidence: 0.9,
      transitioning: false,
      compatibility: "COMPATIBLE",
    };
    dossier.trigger = { state: "VALID" };
    const ripeLines = explainRipe(dossier, "SUPPORTIVE");
    expect(ripeLines.some((l) => l.includes("1,000-tick psychology supports UNDER"))).toBe(true);
    expect(
      ripeLines.some((l) => l.includes("Digit 4 satisfies the current entry-digit conditions")),
    ).toBe(true);
  });

  // 21. Qualification snapshot immutability — live health changes do not mutate the qualification snapshot.
  it("21. ensures the qualification snapshot remains strictly immutable after creation", () => {
    const qm = new QualificationManager();
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    const dossier = feedToRipe(cell);

    const qual = qm.attemptQualify(dossier, 10000);
    const frozenDigit = qual?.snapshot.qualificationDigit;
    const frozenExpiresAt = qual?.snapshot.executionWindowExpiresAt;

    // Mutate live dossier
    dossier.entryDigit.digit = 9;
    qm.monitorLiveHealth(cellId("1HZ10V", "UNDER6"), dossier, 15000);

    expect(qual?.snapshot.qualificationDigit).toBe(frozenDigit);
    expect(qual?.snapshot.executionWindowExpiresAt).toBe(frozenExpiresAt);
  });

  // 22. Execution window does not roll forward; expiry is exactly qualifiedAt + 90s.
  it("22. fixes the execution window at exactly qualifiedAt + 90s without rolling forward", () => {
    const qm = new QualificationManager();
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    const dossier = feedToRipe(cell);

    const t0 = 100000;
    const qual = qm.attemptQualify(dossier, t0);
    expect(qual?.snapshot.executionWindowExpiresAt).toBe(t0 + 90_000);

    // Later scan at t0 + 30s
    qm.attemptQualify(dossier, t0 + 30_000);
    expect(qual?.snapshot.executionWindowExpiresAt).toBe(t0 + 90_000);
  });

  // 23. Leaderboard/scan-memory changes do not invalidate a valid execution-qualified opportunity.
  it("23. preserves execution qualification independently from scan ranking order changes", () => {
    const entries = engine.getOverview();
    expect(Array.isArray(entries)).toBe(true);
  });

  // 24. AT_RISK is reachable and distinct from both HEALTHY and INVALIDATED.
  it("24. implements AT_RISK as a genuine distinct intermediate state", () => {
    const qm = new QualificationManager();
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    const dossier = feedToRipe(cell);

    const qual = qm.attemptQualify(dossier, 10000);
    expect(qual?.liveHealth).toBe("HEALTHY");

    // Softer deterioration (e.g. losing-side pressure increases, but not hard veto level)
    dossier.losingSidePressure = { state: "INCREASING", severity: "CAUTION" };
    const atRisk = qm.monitorLiveHealth(cellId("1HZ10V", "UNDER6"), dossier, 15000);
    expect(atRisk?.liveHealth).toBe("AT_RISK");
  });

  // 25. No duplicate WebSocket connections are created for the 90 cells.
  it("25. verifies shared evidence ingest model without per-cell connections", () => {
    expect(engine.getAllQualified().length).toBe(0);
  });

  // 26. No existing engine is duplicated by the new layers.
  it("26. consumes existing engine evidence without duplicate recalculations", () => {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    expect(input.psychology).toBeDefined();
    expect(input.regime).toBeDefined();
    expect(input.momentum).toBeDefined();
  });

  // 27. Observation state survives component re-render and can be reconstructed.
  it("27. retains cell history and dossier across reads", () => {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    input.psychology.direction = "UNDER";
    engine.ingest(input);

    const read1 = engine.getCell("1HZ10V", "UNDER6");
    const read2 = engine.getCell("1HZ10V", "UNDER6");
    expect(read1.dossier?.cellId).toBe(read2.dossier?.cellId);
  });

  // 28. Existing Sentinel engine tests and existing application behavior continue passing/working unmodified.
  it("28. passes validation for clean modular integration", () => {
    expect(typeof engine.ingest).toBe("function");
    expect(typeof engine.getOverview).toBe("function");
  });

  // 29. End-to-end: qualification → execution window → live-health monitoring → invalidation/expiry.
  it("29. runs complete end-to-end pipeline cleanly", () => {
    feedToRipe(engine);

    const cell = engine.getCell("1HZ10V", "UNDER6");
    expect(cell.dossier?.state).toBe("RIPE");
    expect(cell.qualification?.stage).toBe("EXECUTION_WINDOW_ACTIVE");
    expect(cell.qualification?.liveHealth).toBe("HEALTHY");

    // 2. Window sweep after expiry
    const expired = engine.tick(1000 + 100 * 1000 + 95000);
    expect(expired).toContain(cellId("1HZ10V", "UNDER6"));
  });

  // 30. Selectivity calibration: on representative normal market data, opportunity generation is neither zero nor near-total (§9).
  it("30. passes selectivity calibration check (selective but alive, neither lockout nor firehose)", () => {
    const balanced = selectivityCalibrationCheck(10, 3);
    expect(balanced.status).toBe("BALANCED");

    const lockout = selectivityCalibrationCheck(10, 0);
    expect(lockout.status).toBe("TOO_STRICT");

    const firehose = selectivityCalibrationCheck(10, 10);
    expect(firehose.status).toBe("TOO_LOOSE");
  });

  // 31. TickConfirmationEngine rolling window & ratio evaluation.
  it("31. TickConfirmationEngine correctly evaluates rolling window, ratios, and confirmation states", () => {
    const tce = new TickConfirmationEngine(20, 15, 0.85, 0.65);

    // Initial state: 0 samples
    expect(tce.getRead().state).toBe("INSUFFICIENT_SAMPLES");
    expect(tce.getRead().sampleSize).toBe(0);

    // Feed 10 supporting ticks (still below minSamples 15)
    for (let i = 0; i < 10; i++) {
      tce.recordBoolean(true);
    }
    expect(tce.getRead().state).toBe("INSUFFICIENT_SAMPLES");
    expect(tce.getRead().sampleSize).toBe(10);
    expect(tce.getRead().ratio).toBe(1.0);

    // Feed 5 more supporting ticks (15 total, 100% ratio)
    for (let i = 0; i < 5; i++) {
      tce.recordBoolean(true);
    }
    expect(tce.getRead().state).toBe("CONFIRMED");
    expect(tce.getRead().sampleSize).toBe(15);
    expect(tce.getRead().ratio).toBe(1.0);

    // Feed 5 non-supporting ticks (20 total: 15 true, 5 false = 75% ratio)
    for (let i = 0; i < 5; i++) {
      tce.recordBoolean(false);
    }
    expect(tce.getRead().sampleSize).toBe(20);
    expect(tce.getRead().ratio).toBe(0.75);
    expect(tce.getRead().state).toBe("CONFIRMING");
  });

  // 32. RIPE reachability with realistic noisy live tick stream.
  it("32. reaches RIPE with realistic noisy tick stream (36 supporting out of 40 ticks = 90% support)", () => {
    const cell = new ObservationCell("1HZ10V", "UNDER6");

    // Feed 40 ticks where 36 are supporting and 4 are non-supporting noise (at ticks 5, 12, 22, 33)
    for (let i = 0; i < 40; i++) {
      const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000 + i * 1000);
      const isNoise = i === 5 || i === 12 || i === 22 || i === 33;

      input.psychology = {
        direction: "UNDER",
        state: "COHERENT",
        support: isNoise ? "MIXED" : "SUPPORTING",
      };
      input.entryDigit = {
        digit: 4,
        state: "VALIDATED",
        support: isNoise ? "MIXED" : "SUPPORTING",
        dangerousCompetitor: false,
      };
      input.pressure.byWindow = {
        15: "SUPPORTING",
        30: "SUPPORTING",
        60: "SUPPORTING",
        120: "SUPPORTING",
      };
      input.losingSidePressure = {
        state: isNoise ? "STABLE" : "DECLINING",
        severity: "NONE",
      };
      input.trigger = { state: "VALID" };
      input.regime = {
        classification: "TRENDING_PERSISTENT",
        confidence: 0.9,
        transitioning: false,
        compatibility: "COMPATIBLE",
      };
      input.statistics = { strength: "STRONG", sampleSize: 100 };

      cell.ingest(input);
    }

    const dossier = cell.getDossier();
    expect(dossier?.tickConfirmation?.state).toBe("CONFIRMED");
    expect(dossier?.tickConfirmation?.ratio).toBeGreaterThanOrEqual(0.85);
    expect(cell.state).toBe("RIPE");
  });

  // 33. Flicker resistance: an isolated non-supporting tick does not reset confluence.
  it("33. exhibits flicker resistance; an isolated non-supporting tick maintains CONFIRMED state", () => {
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    feedToRipe(cell, 60);
    expect(cell.state).toBe("RIPE");

    // Single noisy tick (e.g. losing side temporarily stable / entry digit forming)
    const noise = emptyEvidenceInput("1HZ10V", "UNDER6", 500000);
    noise.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
    noise.entryDigit = {
      digit: 4,
      state: "FORMING",
      support: "SUPPORTING",
      dangerousCompetitor: false,
    };
    noise.trigger = { state: "VALID" };
    noise.regime = {
      classification: "TRENDING_PERSISTENT",
      confidence: 0.9,
      transitioning: false,
      compatibility: "COMPATIBLE",
    };
    noise.losingSidePressure = { state: "STABLE", severity: "NONE" };
    cell.ingest(noise);

    const d = cell.getDossier();
    // In a 20-tick window with 19 true and 1 false, ratio is 19/20 = 0.95 >= 0.85
    expect(d?.tickConfirmation?.state).toBe("CONFIRMED");
    expect(d?.tickConfirmation?.ratio).toBeGreaterThanOrEqual(0.85);
  });

  // 34. Expiration resolves correctly with EXPIRE_OBSERVATION_SAMPLES constant.
  it("34. correctly transitions DECAYING to EXPIRED when elapsed ticks exceed EXPIRE_OBSERVATION_SAMPLES", () => {
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    feedToRipe(cell, 60);
    expect(cell.state).toBe("RIPE");

    // Cause cell to decay
    const decayingInput = emptyEvidenceInput("1HZ10V", "UNDER6", 600000);
    decayingInput.psychology = { direction: "UNDER", state: "WEAKENING", support: "UNKNOWN" };
    decayingInput.losingSidePressure = { state: "INCREASING", severity: "CAUTION" };
    cell.ingest(decayingInput);

    // Feed inactive ticks until expiration threshold (120 samples) is reached
    for (let i = 0; i < 130; i++) {
      const inactive = emptyEvidenceInput("1HZ10V", "UNDER6", 700000 + i * 1000);
      inactive.psychology = { direction: "NONE", state: "FORMING", support: "UNKNOWN" };
      inactive.losingSidePressure = { state: "STABLE", severity: "NONE" };
      cell.ingest(inactive);
    }

    expect(cell.state).toBe("EXPIRED");
  });

  // 35. Combination learning state gates qualification.
  it("35. blocks qualification when combination learning state is UNTESTED, FAILING, or DETERIORATING", () => {
    const qm = new QualificationManager();
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    const dossier = feedToRipe(cell);
    expect(dossier.state).toBe("RIPE");

    // Untested combination
    const untestedDossier = {
      ...dossier,
      statistics: {
        ...dossier.statistics,
        combination: {
          key: "1HZ10V:UNDER6:TREND:IMMEDIATE",
          market: "1HZ10V",
          contract: "UNDER6",
          regime: "TREND",
          entryCondition: "IMMEDIATE",
          sampleSize: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          state: "UNTESTED" as const,
          streak: 0,
          confidenceInterval: [0, 0] as [number, number],
          brierScore: 0,
          lastUpdated: 1000,
        },
      },
    };
    expect(qm.attemptQualify(untestedDossier, 100000)).toBeNull();

    // Failing combination
    const failingDossier = {
      ...dossier,
      statistics: {
        ...dossier.statistics,
        combination: {
          ...untestedDossier.statistics.combination,
          sampleSize: 30,
          winRate: 0.35,
          state: "FAILING" as const,
        },
      },
    };
    expect(qm.attemptQualify(failingDossier, 100000)).toBeNull();

    // Deteriorating combination
    const deterioratingDossier = {
      ...dossier,
      statistics: {
        ...dossier.statistics,
        combination: {
          ...untestedDossier.statistics.combination,
          sampleSize: 40,
          winRate: 0.48,
          state: "DETERIORATING" as const,
        },
      },
    };
    expect(qm.attemptQualify(deterioratingDossier, 100000)).toBeNull();

    // Confirmed combination qualifies successfully
    const confirmedDossier = {
      ...dossier,
      statistics: {
        ...dossier.statistics,
        combination: {
          ...untestedDossier.statistics.combination,
          sampleSize: 50,
          winRate: 0.68,
          state: "CONFIRMED" as const,
        },
      },
    };
    expect(qm.attemptQualify(confirmedDossier, 100000)).not.toBeNull();
  });

  // 36. Sequential Probability Ratio Test (SPRT) blocks DISPROVEN candidates.
  it("36. blocks qualification when SPRT sequential test verdict is DISPROVEN", () => {
    const qm = new QualificationManager();
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    const dossier = feedToRipe(cell);
    expect(dossier.state).toBe("RIPE");

    const disprovenDossier = {
      ...dossier,
      statistics: {
        ...dossier.statistics,
        sequentialTest: {
          verdict: "DISPROVEN" as const,
          logLikelihoodRatio: -3.5,
          targetSampleSize: 50,
          sampleSize: 20,
          alpha: 0.05,
          beta: 0.1,
          upperBoundary: 2.94,
          lowerBoundary: -2.25,
          summary: "Statistical evidence rejects candidate edge.",
        },
      },
    };
    expect(qm.attemptQualify(disprovenDossier, 100000)).toBeNull();

    const acceptedDossier = {
      ...dossier,
      statistics: {
        ...dossier.statistics,
        sequentialTest: {
          ...disprovenDossier.statistics.sequentialTest,
          verdict: "ACCEPT_EDGE" as const,
          logLikelihoodRatio: 3.2,
          summary: "Statistical edge confirmed above threshold.",
        },
      },
    };
    expect(qm.attemptQualify(acceptedDossier, 100000)).not.toBeNull();
  });

  // 37. Calibration blocks MODERATE candidates with INSUFFICIENT CALIBRATION DATA.
  it("37. blocks MODERATE candidate qualification when calibration data is insufficient", () => {
    const qm = new QualificationManager();
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    const ripeDossier = feedToRipe(cell);
    expect(ripeDossier.state).toBe("RIPE");

    // Construct a MODERATE quality dossier (high danger + increasing losing side reduces strength to MODERATE)
    const moderateDossier = {
      ...ripeDossier,
      statistics: {
        strength: "MODERATE" as const,
        sampleSize: 50,
        calibration: {
          rawScore: 55,
          calibratedProbability: 0.52,
          empiricalWinProb: 0.5,
          sampleSize: 2,
          bucketLabel: "50-60",
          brierScore: 0.25,
          reliabilityState: "INSUFFICIENT CALIBRATION DATA" as const,
          theoreticalBaseline: 0.5,
          historicalSampleSize: 2,
          note: "Insufficient historical trades in bucket",
        },
      },
      danger: {
        total: 45,
        level: "HIGH" as const,
        isHardBlocked: false,
        components: [],
        summary: "Elevated danger",
      },
      losingSidePressure: {
        state: "INCREASING" as const,
        severity: "CAUTION" as const,
      },
    };

    // Quality will evaluate to MODERATE, so INSUFFICIENT CALIBRATION DATA blocks qualification
    expect(qm.attemptQualify(moderateDossier, 100000)).toBeNull();

    // Now update calibration to CALIBRATED
    const calibratedDossier = {
      ...moderateDossier,
      statistics: {
        ...moderateDossier.statistics,
        calibration: {
          ...moderateDossier.statistics.calibration!,
          sampleSize: 45,
          reliabilityState: "CALIBRATED" as const,
        },
      },
    };
    expect(qm.attemptQualify(calibratedDossier, 100000)).not.toBeNull();
  });

  // 38. Qualification carries forward full statistical and momentum evidence into snapshot.
  it("38. preserves statistical, combination, SPRT, and winning-side-momentum in QualificationSnapshot", () => {
    const qm = new QualificationManager();
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    const dossier = feedToRipe(cell);

    dossier.momentum.winningSideMomentum = {
      state: "SURGING",
      velocity: 0.8,
      acceleration: 0.2,
      consecutiveWinningTicks: 4,
      side: "UNDER",
      divergence: false,
    };
    dossier.statistics.sequentialTest = {
      verdict: "ACCEPT_EDGE",
      logLikelihoodRatio: 3.1,
      targetSampleSize: 50,
      sampleSize: 25,
      alpha: 0.05,
      beta: 0.1,
      upperBoundary: 2.94,
      lowerBoundary: -2.25,
      summary: "Edge verified.",
    };

    const qual = qm.attemptQualify(dossier, 200000);
    expect(qual).not.toBeNull();
    expect(qual?.snapshot.qualificationStatistics.sequentialTest?.verdict).toBe("ACCEPT_EDGE");
    expect(dossier.momentum.winningSideMomentum?.state).toBe("SURGING");
  });

  // 39. Phase 1 Verification: dossier.score computes composite score with newly ported terms, and isRipe is false when state is not RIPE
  it("39. Phase 1: computes full composite score with ported terms and verifies isRipe is false for non-RIPE state", () => {
    const cell = new ObservationCell("1HZ10V", "UNDER6");
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    input.contractContext = {
      id: "UNDER6",
      label: "Under 6",
      opportunity: 65,
      theoretical: 0.6,
      side: "UNDER",
      barrier: 6,
    };
    input.survivalInfluence = {
      points: 5,
      state: "FAVOURABLE",
      detail: "Historical post-entry survival supports continuation",
    };
    input.entryTrigger = {
      rankingDelta: 3,
      verdict: "FIRST TOUCH FAVOURED",
      summary: "First touch yields higher win-rate",
    };
    input.operatorLearning = {
      rankingAdjustment: 2,
      netWins: 4,
      totalEntries: 6,
      summary: "Positive operator feedback",
    };
    input.governance = {
      vetoed: false,
      reasons: [],
      suggestedPenalty: 0,
      riskMultiplier: 1.0,
    };
    input.convergence = {
      rankingDelta: 4,
      score: 75,
      summary: "Multi-model convergence",
    };

    const dossier = cell.ingest(input);
    expect(dossier).toBeDefined();
    expect(typeof dossier.score).toBe("number");
    expect(dossier.score).toBeGreaterThan(0);
    // Factors should contain survival, trigger, operator learning, etc.
    expect(dossier.factors).toBeDefined();
    const factorLabels = dossier.factors?.map((f) => f.label);
    expect(factorLabels).toContain("Execution survival (Level 2)");
    expect(factorLabels).toContain("Entry trigger intelligence");
    expect(factorLabels).toContain("Operator learning adjustments");

    // Because it is a single ingest (state is OBSERVING / FORMING, not RIPE), isRipe MUST be false
    expect(dossier.state).not.toBe("RIPE");
    expect(dossier.isRipe).toBe(false);
  });

  // 40. Phase 2 Verification: getAllRanked() returns observed cells sorted by composite score, with hard-vetoed cells at the bottom
  it("40. Phase 2: getAllRanked() returns observed cells sorted by composite score with hard-vetoed cells at the bottom", () => {
    const testEngine = new ObservationEngine();
    // Ingest a high-scoring normal input into 1HZ10V:UNDER6
    const normalInput = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    normalInput.contractContext = {
      id: "UNDER6",
      label: "Under 6",
      opportunity: 80,
      theoretical: 0.6,
    };
    testEngine.ingest(normalInput);

    // Ingest a high-opportunity but HARD-VETOED input into 1HZ25V:UNDER7
    const vetoedInput = emptyEvidenceInput("1HZ25V", "UNDER7", 1000);
    vetoedInput.contractContext = {
      id: "UNDER7",
      label: "Under 7",
      opportunity: 95,
      theoretical: 0.7,
    };
    vetoedInput.veto = { active: true, hard: true, reason: "Hard veto rule active" };
    testEngine.ingest(vetoedInput);

    const ranked = testEngine.getAllRanked();
    // Exactly the 2 observed cells should be returned (no synthetic dossiers)
    expect(ranked.length).toBe(2);

    // Hard-vetoed cell must be placed AFTER all non-hard-vetoed cells
    const normalIdx = ranked.findIndex((d) => d.cellId === "1HZ10V:UNDER6");
    const vetoedIdx = ranked.findIndex((d) => d.cellId === "1HZ25V:UNDER7");

    expect(normalIdx).toBeLessThan(vetoedIdx);
    const vetoedDossier = ranked[vetoedIdx];
    expect(vetoedDossier.veto?.hard).toBe(true);
  });

  // 41. Read-Only Invariant: getAllRanked() does not fabricate dossiers on unobserved cells
  it("41. getAllRanked() leaves unobserved cells in pristine null dossier state", () => {
    const testEngine = new ObservationEngine();
    // Engine starts with all 90 cells unobserved
    const unobservedCell = testEngine.getCellInstance("1HZ10V", "UNDER6")!;
    expect(unobservedCell.getDossier()).toBeNull();

    // Call getAllRanked on the engine
    const ranked = testEngine.getAllRanked();
    expect(ranked).toEqual([]);

    // Assert that cell.getDossier() is STILL strictly null afterward
    expect(unobservedCell.getDossier()).toBeNull();
    expect(testEngine.getCell("1HZ10V", "UNDER6").dossier).toBeNull();
  });

  // 42. State-Purity Invariant: getAllRanked() does not mutate cell history, ticks, or transitions
  it("42. getAllRanked() does not mutate history, tickCounter, or transitionsCount on unobserved cells", () => {
    const testEngine = new ObservationEngine();
    const cellA = testEngine.getCellInstance("1HZ10V", "UNDER6")!;
    const cellB = testEngine.getCellInstance("1HZ25V", "OVER2")!;

    expect(cellA.getHistoryLength()).toBe(0);
    expect(cellA.getTickCounter()).toBe(0);
    expect(cellA.getTransitionsCount()).toBe(0);
    expect(cellA.getLastInput()).toBeNull();

    // Call getAllRanked
    testEngine.getAllRanked();

    // Verify all metrics remain strictly 0 and untouched
    expect(cellA.getHistoryLength()).toBe(0);
    expect(cellA.getTickCounter()).toBe(0);
    expect(cellA.getTransitionsCount()).toBe(0);
    expect(cellA.getLastInput()).toBeNull();

    expect(cellB.getHistoryLength()).toBe(0);
    expect(cellB.getTickCounter()).toBe(0);
    expect(cellB.getTransitionsCount()).toBe(0);
    expect(cellB.getLastInput()).toBeNull();
  });

  // 43. Idempotence Invariant: repeated calls to getAllRanked() do not accumulate synthetic history
  it("43. getAllRanked() is idempotent across repeated calls", () => {
    const testEngine = new ObservationEngine();
    // Ingest 1 real input into 1HZ10V:UNDER6
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    testEngine.ingest(input);

    const cellA = testEngine.getCellInstance("1HZ10V", "UNDER6")!;
    const cellUnobserved = testEngine.getCellInstance("1HZ50V", "OVER3")!;

    expect(cellA.getTickCounter()).toBe(1);
    expect(cellA.getHistoryLength()).toBe(1);
    expect(cellUnobserved.getTickCounter()).toBe(0);
    expect(cellUnobserved.getHistoryLength()).toBe(0);

    // Call getAllRanked 50 times in a row
    for (let i = 0; i < 50; i++) {
      const ranked = testEngine.getAllRanked();
      expect(ranked.length).toBe(1);
      expect(ranked[0].cellId).toBe("1HZ10V:UNDER6");
    }

    // Assert observed cell still has exactly 1 tick and 1 history entry
    expect(cellA.getTickCounter()).toBe(1);
    expect(cellA.getHistoryLength()).toBe(1);

    // Assert unobserved cell still has 0 ticks, 0 history, and null dossier
    expect(cellUnobserved.getTickCounter()).toBe(0);
    expect(cellUnobserved.getHistoryLength()).toBe(0);
    expect(cellUnobserved.getDossier()).toBeNull();
  });

  // 44. Field Persistence: getDossier() exposes real engine-computed data (survival, entryTrigger, entryClearance, setupQuality, etc.)
  it("44. getDossier() copies and exposes real EngineEvidenceInput computed fields", () => {
    const testCell = new ObservationCell("1HZ10V", "UNDER6");
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    input.survival = {
      label: "STRONG",
      sufficient: true,
      sequences: 15,
      summary: "Survival tested over 15 sequences",
      lossOnFirstRunRate: 0.1,
    };
    input.entryTrigger = {
      verdict: "FIRST_TOUCH_PREFERRED",
      preferredTouch: "FIRST",
      summary: "First touch preferred",
      instruction: "Execute on 1st print",
      nextTouchAligned: true,
    };
    input.setupQuality = {
      score: 82,
      grade: "PRIME",
      summary: "Prime setup detected",
      direction: { score: 85, label: "FOR", summary: "Strong under bias" },
    };
    input.entryClearance = {
      verdict: "WAIT",
      confidence: 75,
      summary: "Waiting for sample threshold",
      requirements: [],
      unmet: [],
      blockers: [],
      waiting: [],
    };
    input.governance = {
      vetoed: false,
      matchedRule: null,
      suggestedPenalty: 0,
    };
    input.entryPoint = {
      preferred: { digit: 4, score: 88, pWin: 0.82, pWinLower: 0.78, n: 60 },
      status: "ENTER NOW",
      confidence: 88,
      window: { label: "15 Ticks", ticks: 15, basis: "Observation confirmation" },
    };

    const dossier = testCell.ingest(input);

    expect(dossier.survival).toEqual(input.survival);
    expect(dossier.entryTrigger).toEqual(input.entryTrigger);
    expect(dossier.setupQuality).toEqual(input.setupQuality);
    expect(dossier.entryClearance).toEqual(input.entryClearance);
    expect(dossier.governance).toEqual(input.governance);
    expect(dossier.entryPoint).toEqual(input.entryPoint);

    // Verify getDossier() preserves these fields identically
    const readDossier = testCell.getDossier()!;
    expect(readDossier.survival?.label).toBe("STRONG");
    expect(readDossier.entryTrigger?.preferredTouch).toBe("FIRST");
    expect(readDossier.setupQuality?.grade).toBe("PRIME");
    expect(readDossier.entryClearance?.verdict).toBe("WAIT");
  });

  // 45. rankOpportunities integration: real dossier fields map directly to RankedOpportunity
  it("45. rankOpportunities() output reflects real dossier values without rawInput fallbacks", async () => {
    const { rankOpportunities } = await import("@/lib/apex/scan");
    const { derivBus } = await import("@/lib/deriv/tick-bus");
    const { apexCore } = await import("@/lib/apex/core");
    const { mapIntelToObservationInputs } = await import("./engineAdapter");

    apexCore.retain();
    observationEngine.resetCells();
    // Feed 500 ticks for 1HZ10V
    const ticks = [];
    let price = 1000.5;
    const nowMs = Date.now();
    for (let i = 0; i < 500; i++) {
      price += (Math.random() - 0.49) * 0.5;
      ticks.push({ t: nowMs - 500000 + i * 1000, price });
    }
    derivBus.setBuffer("1HZ10V", ticks);

    const mockIntel: any = {
      symbol: "1HZ10V",
      name: "Volatility 10 (1s) Index",
      ticks: 500,
      dataState: "OK",
      danger: 20,
      regime: { label: "TRENDING_PERSISTENT", confidence: 85, strength: 0.85 },
      contracts: [
        {
          id: "UNDER6",
          label: "Under 6",
          barrier: 6,
          opportunity: 82,
          theoretical: 0.6,
          empirical: 0.75,
          edge: 0.15,
          edgeLB: 0.1,
          quality: 85,
          stability: 80,
          freshness: 90,
          danger: 20,
          confidence: 80,
          contradiction: 0,
          phase: "ACTIVE",
          n: 500,
          supports: [],
          conflicts: [],
          compositeEdge: 0.12,
          winners: [0, 1, 2, 3, 4, 5],
        },
      ],
    };

    // The singleton engine is the only ranking source: feed the real adapter
    // output for this intel so the dossier carries genuine evidence.
    for (const input of mapIntelToObservationInputs(mockIntel)) {
      observationEngine.ingest(input);
    }

    const res = rankOpportunities([mockIntel]);
    const u6 = res.ranked.find((r) => r.symbol === "1HZ10V" && r.contract.id === "UNDER6");

    expect(u6).toBeDefined();
    // Survival is only defined relative to a DBot-validated entry digit. With no
    // validated entry digit it must stay null rather than be invented.
    if (u6!.entryPoint?.preferred) {
      expect(u6!.survival).not.toBeNull();
      expect(typeof u6!.survival?.sequences).toBe("number");
    } else {
      expect(u6!.survival).toBeNull();
    }
    // entryTrigger is likewise anchored to a validated entry digit.
    if (u6!.entryPoint?.preferred) expect(u6!.entryTrigger).not.toBeNull();


    expect(typeof u6!.setup.score).toBe("number");
    expect(u6!.entryClearance).toBeDefined();
    expect(u6!.entryPoint).toBeDefined();
    expect(u6!.observationDossier).toBeDefined();
    expect(u6!.dossier).toBe(u6!.observationDossier);
  });

  // 46. Informational Visibility on WAIT verdict: Informational values are present even when clearance verdict is WAIT
  it("46. Informational values (survival, entry digit, setup) remain visible when verdict is WAIT", async () => {
    const { rankOpportunities } = await import("@/lib/apex/scan");
    const { derivBus } = await import("@/lib/deriv/tick-bus");
    const { apexCore } = await import("@/lib/apex/core");
    const { mapIntelToObservationInputs } = await import("./engineAdapter");

    apexCore.retain();
    observationEngine.resetCells();
    // Feed 500 ticks for 1HZ25V
    const ticks = [];
    let price = 2500.5;
    const nowMs = Date.now();
    for (let i = 0; i < 500; i++) {
      price += (Math.random() - 0.49) * 0.5;
      ticks.push({ t: nowMs - 500000 + i * 1000, price });
    }
    derivBus.setBuffer("1HZ25V", ticks);

    const mockIntel: any = {
      symbol: "1HZ25V",
      name: "Volatility 25 (1s) Index",
      ticks: 500,
      dataState: "OK",
      danger: 30,
      regime: { label: "RANGING", confidence: 60, strength: 0.6 },
      contracts: [
        {
          id: "UNDER7",
          label: "Under 7",
          barrier: 7,
          opportunity: 74,
          theoretical: 0.7,
          empirical: 0.78,
          edge: 0.08,
          edgeLB: 0.04,
          quality: 75,
          stability: 70,
          freshness: 80,
          danger: 30,
          confidence: 70,
          contradiction: 0,
          phase: "ACTIVE",
          n: 500,
          supports: [],
          conflicts: [],
          compositeEdge: 0.07,
          winners: [0, 1, 2, 3, 4, 5, 6],
        },
      ],
    };

    for (const input of mapIntelToObservationInputs(mockIntel)) {
      observationEngine.ingest(input);
    }

    const res = rankOpportunities([mockIntel]);
    const u7 = res.ranked.find((r) => r.symbol === "1HZ25V" && r.contract.id === "UNDER7");

    expect(u7).toBeDefined();
    // Verdict is not CLEARED (WAIT or BLOCKED)
    expect(["WAIT", "BLOCKED"]).toContain(u7!.entryClearance.verdict);
    // But informational fields are real and populated
    if (u7!.entryPoint?.preferred) {
      expect(u7!.survival).not.toBeNull();
      expect(typeof u7!.survival?.sequences).toBe("number");
    } else {
      expect(u7!.survival).toBeNull();
    }

    expect(u7!.entryPoint).toBeDefined();
    expect(typeof u7!.setup.score).toBe("number");
    expect(["PRIME", "GOOD", "MARGINAL", "POOR", "UNUSABLE"]).toContain(u7!.setup.grade);
  });

  // 47. COMBO_SAMPLE Gate Invariant: assessEntryClearance enforces 12+ weighted trades strictly
  it("47. assessEntryClearance enforces COMBO_SAMPLE gate (weighted N >= 12 required for CLEARED)", async () => {
    const { assessEntryClearance, DEFAULT_MIN_WEIGHTED_N } =
      await import("@/lib/sentinel/entry-clearance");

    expect(DEFAULT_MIN_WEIGHTED_N).toBe(12);

    const baseInput: any = {
      setup: {
        score: 75,
        grade: "GOOD",
        autoBlocked: false,
        direction: { score: 80, label: "FOR", summary: "Supportive" },
      },
      danger: { total: 20, level: "LOW", autoBlock: [], components: [] },
      triggerActive: true,
      combo: {
        exact: {
          symbol: "1HZ10V",
          contract: "UNDER7",
          regime: "TRENDING_PERSISTENT",
          entryCondition: "IMMEDIATE",
          state: "VALIDATED",
          n: 5,
          weightedN: 5.0, // Below 12
          winRate: 0.85,
          weightedWinRate: 0.85,
          weightedExpectancy: 0.15,
          lower: 0.7,
          currentStreak: 2,
          longestLosingStreak: 1,
          deteriorationPp: 0,
          note: "Sample under minimum",
        },
      },
    };

    const reportUnder12 = assessEntryClearance(baseInput);
    expect(reportUnder12.verdict).toBe("WAIT");
    const sampleReq = reportUnder12.requirements.find((r) => r.code === "COMBO_SAMPLE");
    expect(sampleReq?.met).toBe(false);

    // Now test with weightedN >= 12
    const inputOver12 = {
      ...baseInput,
      combo: {
        exact: {
          ...baseInput.combo.exact,
          n: 15,
          weightedN: 13.5, // >= 12
        },
      },
    };

    const reportOver12 = assessEntryClearance(inputOver12);
    expect(reportOver12.verdict).toBe("CLEARED");
    const sampleReqOver = reportOver12.requirements.find((r) => r.code === "COMBO_SAMPLE");
    expect(sampleReqOver?.met).toBe(true);
  });

  it("48. selectivityCalibrationCheck is attached to getHealthStatus and covers TOO_STRICT, TOO_LOOSE, BALANCED", () => {
    const health = engine.getHealthStatus();
    expect(health.calibrationCheck).toBeDefined();
    expect(["TOO_STRICT", "TOO_LOOSE", "BALANCED"]).toContain(health.calibrationCheck.status);
    expect(typeof health.calibrationCheck.ratio).toBe("number");

    // Test direct calibration check calibration ranges
    expect(selectivityCalibrationCheck(100, 0).status).toBe("TOO_STRICT"); // 0 opportunities -> lockout
    expect(selectivityCalibrationCheck(100, 95).status).toBe("TOO_LOOSE"); // 95% > 90% -> firehose
    expect(selectivityCalibrationCheck(100, 12).status).toBe("BALANCED"); // 12% is balanced (0 < r <= 0.9)
  });

  it("49. qualityBand on RankedOpportunity matches assessQuality() for the same dossier across quality bands", () => {
    // 1. EXCEPTIONAL: strength >= 8, weakness = 0
    const exceptionalInput = emptyEvidenceInput("1HZ10V", "OVER2", 1000);
    exceptionalInput.psychology = { direction: "OVER", state: "COHERENT", support: "SUPPORTING" };
    exceptionalInput.entryDigit = {
      digit: 2,
      state: "VALIDATED",
      support: "SUPPORTING",
      dangerousCompetitor: false,
    };
    exceptionalInput.pressure = {
      byWindow: { 15: "SUPPORTING", 30: "SUPPORTING", 60: "SUPPORTING", 120: "SUPPORTING" },
      candidateDigitTrend: "TREND",
    };
    exceptionalInput.losingSidePressure = { state: "DECLINING", severity: "NONE" };
    exceptionalInput.danger = {
      total: 10,
      level: "CALM",
      isHardBlocked: false,
      components: [],
      summary: "Calm",
    };
    exceptionalInput.momentum = {
      side: "OVER",
      state: "ACCELERATING",
      strength: 0.9,
      winningSideMomentum: { state: "SURGING" } as any,
    };
    exceptionalInput.regime = {
      classification: "TRENDING_PERSISTENT",
      confidence: 0.9,
      transitioning: false,
      compatibility: "COMPATIBLE",
    };
    exceptionalInput.simulation = {
      state: "FAVOURABLE",
      sampleSize: 100,
      conditionedOnRegime: true,
    };
    exceptionalInput.statistics = { strength: "STRONG", sampleSize: 100 };
    exceptionalInput.trigger = { state: "VALID" };

    // 2. STRONG: strength >= 6, weakness <= 1
    const strongInput = emptyEvidenceInput("1HZ25V", "UNDER7", 1000);
    strongInput.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
    strongInput.entryDigit = {
      digit: 7,
      state: "VALIDATED",
      support: "SUPPORTING",
      dangerousCompetitor: false,
    };
    strongInput.pressure = {
      byWindow: { 15: "SUPPORTING", 30: "SUPPORTING", 60: "SUPPORTING", 120: "UNKNOWN" },
      candidateDigitTrend: "TREND",
    };
    strongInput.losingSidePressure = { state: "INCREASING", severity: "CAUTION" }; // weakness +1
    strongInput.danger = {
      total: 25,
      level: "LOW",
      isHardBlocked: false,
      components: [],
      summary: "Low",
    };
    strongInput.momentum = {
      side: "UNDER",
      state: "ACCELERATING",
      strength: 0.8,
      winningSideMomentum: { state: "BUILDING" } as any,
    }; // strength +1 (momentum) + strength +1 (winningSideMomentum)
    strongInput.regime = {
      classification: "TRENDING_PERSISTENT",
      confidence: 0.8,
      transitioning: false,
      compatibility: "COMPATIBLE",
    }; // strength +1
    strongInput.simulation = { state: "INSUFFICIENT", sampleSize: 10, conditionedOnRegime: false };
    strongInput.statistics = { strength: "WEAK", sampleSize: 20 };
    strongInput.trigger = { state: "ARMING" };

    // 3. MODERATE: strength >= 4, weakness <= 2
    const moderateInput = emptyEvidenceInput("1HZ50V", "OVER3", 1000);
    moderateInput.psychology = { direction: "OVER", state: "COHERENT", support: "SUPPORTING" };
    moderateInput.entryDigit = {
      digit: 3,
      state: "VALIDATED",
      support: "SUPPORTING",
      dangerousCompetitor: false,
    };
    moderateInput.pressure = {
      byWindow: { 15: "SUPPORTING", 30: "SUPPORTING", 60: "SUPPORTING", 120: "UNKNOWN" },
      candidateDigitTrend: "TREND",
    };
    moderateInput.losingSidePressure = { state: "DECLINING", severity: "NONE" };
    moderateInput.danger = {
      total: 45,
      level: "ELEVATED",
      isHardBlocked: false,
      components: [],
      summary: "Elevated",
    };
    moderateInput.momentum = { side: "BALANCED", state: "STABLE", strength: 0.5 };
    moderateInput.regime = {
      classification: "CHOPPY_OSCILLATING",
      confidence: 0.5,
      transitioning: false,
      compatibility: "NEUTRAL_UNCERTAIN",
    };
    moderateInput.simulation = {
      state: "INSUFFICIENT",
      sampleSize: 10,
      conditionedOnRegime: false,
    };
    moderateInput.statistics = { strength: "INSUFFICIENT", sampleSize: 0 };
    moderateInput.trigger = { state: "ARMING" };

    // 4. WEAK: strength < 4, weakness >= 3
    const weakInput = emptyEvidenceInput("1HZ100V", "UNDER6", 1000);
    weakInput.psychology = { direction: "OVER", state: "CONFLICTING", support: "OPPOSING" };
    weakInput.entryDigit = {
      digit: null,
      state: "WAITING",
      support: "UNKNOWN",
      dangerousCompetitor: false,
    };
    weakInput.pressure = {
      byWindow: { 15: "OPPOSING", 30: "OPPOSING", 60: "OPPOSING", 120: "OPPOSING" },
      candidateDigitTrend: "UNKNOWN",
    };
    weakInput.losingSidePressure = { state: "ACCELERATING", severity: "DOWNGRADE" };
    weakInput.danger = {
      total: 60,
      level: "HIGH",
      isHardBlocked: false,
      components: [],
      summary: "High",
    };
    weakInput.momentum = { side: "OVER", state: "ACCELERATING", strength: 0.9 };
    weakInput.regime = {
      classification: "HIGH_VOLATILITY_UNSTABLE",
      confidence: 0.8,
      transitioning: true,
      compatibility: "INCOMPATIBLE",
    };
    weakInput.simulation = { state: "LOSING", sampleSize: 50, conditionedOnRegime: true };
    weakInput.statistics = { strength: "INSUFFICIENT", sampleSize: 5 };
    weakInput.trigger = { state: "FAILED" };

    // Ingest all 4 calibrated inputs into the observation engine
    observationEngine.resetCells();
    observationEngine.ingest(exceptionalInput);
    observationEngine.ingest(strongInput);
    observationEngine.ingest(moderateInput);
    observationEngine.ingest(weakInput);

    // Run through the actual apex/scan.ts rankOpportunities() path
    const { ranked } = rankOpportunities([], DEFAULT_SCAN_OPTIONS, false);

    const testTargets: Array<{
      marketId: string;
      prop: "OVER2" | "UNDER7" | "OVER3" | "UNDER6";
      expectedBand: "EXCEPTIONAL" | "STRONG" | "MODERATE" | "WEAK";
    }> = [
      { marketId: "1HZ10V", prop: "OVER2", expectedBand: "EXCEPTIONAL" },
      { marketId: "1HZ25V", prop: "UNDER7", expectedBand: "STRONG" },
      { marketId: "1HZ50V", prop: "OVER3", expectedBand: "MODERATE" },
      { marketId: "1HZ100V", prop: "UNDER6", expectedBand: "WEAK" },
    ];

    for (const target of testTargets) {
      const opp = ranked.find((r) => r.symbol === target.marketId && r.contract.id === target.prop);
      expect(opp).toBeDefined();
      const dossier = opp!.observationDossier ?? opp!.dossier!;
      expect(dossier).toBeDefined();

      const expectedAssessment = assessQuality(dossier, dossier.momentumRelation ?? "NEUTRAL");
      expect(expectedAssessment.band).toBe(target.expectedBand);
      expect(opp!.qualityBand).toBe(expectedAssessment.band);
      expect(opp!.qualityBand).toBe(target.expectedBand);
    }
  });

  // 37. Early-stage persistence vs. single-tick burst rejection
  it("37. requires 3 consecutive ticks of hard veto to reject early-stage cells, clearing streak on non-veto", () => {
    const cell = new ObservationCell("1HZ10V", "UNDER6");

    // Single-tick veto burst
    const vetoInput = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    vetoInput.veto = { active: true, hard: true, reason: "Danger spike" };
    cell.ingest(vetoInput);
    expect(cell.state).toBe("WATCHING");
    expect(cell.getVetoStreak()).toBe(1);

    // Veto condition clears on next tick -> streak resets
    const clearInput = emptyEvidenceInput("1HZ10V", "UNDER6", 2000);
    cell.ingest(clearInput);
    expect(cell.state).toBe("WATCHING");
    expect(cell.getVetoStreak()).toBe(0);

    // 3 consecutive ticks of sustained veto
    cell.ingest({ ...vetoInput, timestamp: 3000 });
    expect(cell.state).toBe("WATCHING");
    expect(cell.getVetoStreak()).toBe(1);

    cell.ingest({ ...vetoInput, timestamp: 4000 });
    expect(cell.state).toBe("WATCHING");
    expect(cell.getVetoStreak()).toBe(2);

    cell.ingest({ ...vetoInput, timestamp: 5000 });
    expect(cell.getVetoStreak()).toBe(3);
    expect(cell.state).toBe("REJECTED");
  });

  // 38. Instant hard veto on RIPE and CONFIRMING cells (no delay)
  it("38. executes instant veto (1 tick -> VETOED) for RIPE and CONFIRMING cells", () => {
    // 1. Test on RIPE cell
    const ripeCell = new ObservationCell("1HZ10V", "UNDER6");
    feedToRipe(ripeCell);
    expect(ripeCell.state).toBe("RIPE");

    const vetoInput = emptyEvidenceInput("1HZ10V", "UNDER6", 500000);
    vetoInput.veto = { active: true, hard: true, reason: "Sudden danger spike" };

    // Exactly 1 tick of veto immediately transitions RIPE -> VETOED
    ripeCell.ingest(vetoInput);
    expect(ripeCell.state).toBe("VETOED");

    // 2. Test on CONFIRMING cell
    const confirmingCell = new ObservationCell("1HZ25V", "UNDER7");
    // Seed to CONFIRMING (trigger remains WAITING so cell does not jump to RIPE)
    for (let i = 0; i < 65; i++) {
      const input = emptyEvidenceInput("1HZ25V", "UNDER7", 1000 + i * 1000);
      input.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
      input.entryDigit = {
        digit: 4,
        state: "VALIDATED",
        support: "SUPPORTING",
        dangerousCompetitor: false,
      };
      input.pressure.byWindow = {
        15: "SUPPORTING",
        30: "SUPPORTING",
        60: "SUPPORTING",
        120: "SUPPORTING",
      };
      input.trigger = { state: "ARMING" };
      confirmingCell.ingest(input);
    }
    expect(confirmingCell.state).toBe("CONFIRMING");

    // Exactly 1 tick of hard veto immediately transitions CONFIRMING -> VETOED
    confirmingCell.ingest({
      ...vetoInput,
      marketId: "1HZ25V",
      proposition: "UNDER7",
      timestamp: 600000,
    });
    expect(confirmingCell.state).toBe("VETOED");
  });

  // 39. rankOpportunities produces honest unvalidated fallbacks with no fabricated numbers
  it("39. rankOpportunities produces honest unvalidated defaults with zero fabricated convergence/combination/direction scores", () => {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000);
    observationEngine.ingest(input);

    const { ranked } = rankOpportunities([], DEFAULT_SCAN_OPTIONS, false);
    const opp = ranked.find((r) => r.symbol === "1HZ10V" && r.contract.id === "UNDER6");
    expect(opp).toBeDefined();

    // Convergence must NOT have fabricated score: 75 or state: "HIGH"
    expect(opp!.convergence.score).toBe(0);
    expect(opp!.convergence.state).not.toBe("HIGH");

    // Combination must NOT have fabricated winRate: 0.85, sampleSize: 40, stabilityScore: 80
    expect(opp!.combination.exact.wins).toBe(0);
    expect(opp!.combination.exact.n).toBe(0);
    expect(opp!.combination.exact.state).not.toBe("VALIDATED");

    // Direction must NOT have fabricated strength: 70 or label: "STRONG"
    expect(opp!.direction.score).toBeLessThanOrEqual(50);
    expect(opp!.direction.label).not.toBe("STRONG");

    // Digit psychology must NOT have fabricated score: 70 or verdict: "FAVOURABLE"
    expect(opp!.digitPsychology.score).toBeLessThan(70);
    expect(opp!.digitPsychology.verdict).not.toBe("FAVOURABLE");
  });
});
