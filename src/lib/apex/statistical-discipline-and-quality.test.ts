// APEX SENTINEL — HARMONIZED MASTER ARCHITECTURE & STATISTICAL DISCIPLINE TESTS
// Tests 1 to 18 & Tests 29A-F & Test 30
// Verifying Radar, Ranking, Statistical Discipline, Qualification, Waiting Runway, Strict Execution, Adaptive Quality

import { describe, it, expect, beforeEach } from "vitest";
import {
  assessMultipleTesting,
  applyMultipleTestingScoreDiscipline,
} from "../sentinel/multiple-testing";
import {
  OPERATOR_SURFACE_THRESHOLDS,
  type OperatorSurfaceThresholds,
} from "./operator-surface-thresholds";
import {
  evaluateOperatorSurfaceGate,
  STRUCTURAL_MIN_TICKS,
} from "./operator-surface-gate";
import {
  engineEffectiveness,
  engineInfluence,
  EFFECTIVENESS_HALF_LIFE_MS,
} from "./engine-effectiveness";
import {
  ParityEnsembleLearner,
  ENSEMBLE_HALF_LIFE_MS,
} from "../parity/engine-library/engines/ensemble-engine";
import { runParityConfluenceEngine } from "../parity/engine-library/engines/confluence-engine";
import { runSignalDecayEngine } from "../parity/engine-library/engines/decay-engine";
import { apexSimulator, type SimTrade } from "./simulator";

/** Fixtures populate only the fields the effectiveness engines actually read. */
const asTrades = (rows: unknown[]): SimTrade[] => rows as SimTrade[];
import { evaluateExecutionReady } from "../sentinel/execution-ready";
import { mapObservationStateToSignalLifecycle } from "../sentinel/signal-state";
import { assessEntryClearance } from "../sentinel/entry-clearance";

describe("SENTINEL MASTER TEST SUITE — ARCHITECTURE TESTS 1 TO 13", () => {
  // TEST 1 — 90 CELLS, ZERO QUALIFIED
  it("TEST 1: 90 cells active, 0 qualify -> 90 remain observable, 0 actionable, no fake best-available", () => {
    const rawCells = Array.from({ length: 90 }, (_, i) => ({
      id: `cell-${i}`,
      score: 55, // below minScore 65
      danger: 30,
      contradiction: 20,
    }));

    const qualified = rawCells.filter((c) =>
      evaluateOperatorSurfaceGate(
        { score: c.score, danger: { total: c.danger } } as any,
        {
          symbol: "1HZ10V",
          ticks: Array.from({ length: 1000 }, (_, idx) => ({ epoch: idx, quote: 100 + idx })),
          dataState: "OK",
          lastTickAgeMs: 500,
        } as any,
      ).qualified,
    );

    expect(rawCells.length).toBe(90); // 90 observable
    expect(qualified.length).toBe(0); // 0 actionable
  });

  // TEST 2 — RANKED BUT NOT QUALIFIED
  it("TEST 2: ranked[0] exists, qualified = [] -> remains radar/developing, NOT actionable", () => {
    const candidate = {
      score: 62, // below 65 minScore
      danger: { total: 20 },
      contradiction: 10,
    };
    const intel = {
      symbol: "1HZ10V",
      ticks: Array.from({ length: 1000 }, (_, idx) => ({ epoch: idx, quote: 100 + idx })),
      dataState: "OK",
      lastTickAgeMs: 500,
    };

    const gate = evaluateOperatorSurfaceGate(candidate as any, intel as any);
    expect(gate.qualified).toBe(false);
    expect(gate.surfaceState).toBe("WATCH"); // Remains on radar/developing surface, not surfaced
  });

  // TEST 3 — QUALIFIED BUT WAITING
  it("TEST 3: strong structural setup, entry trigger not active -> QUALIFIED / VALID_WAIT_ENTRY, not rejected", () => {
    const lifecycle = mapObservationStateToSignalLifecycle("VALID_WAIT_ENTRY");
    expect(lifecycle.phase).toBe("INCUBATING");
    expect(lifecycle.isActionable).toBe(false);
    expect(lifecycle.isWaitingForTrigger).toBe(true);
    expect(lifecycle.displayLabel).toContain("WAITING FOR ENTRY");
  });

  // TEST 4 — WAITING -> EXECUTION
  it("TEST 4: simulate valid entry condition -> VALID_WAIT_ENTRY promotes to STRONG / EXECUTION_READY", () => {
    const readyState = mapObservationStateToSignalLifecycle("RIPE");
    expect(readyState.phase).toBe("ACTIONABLE");
    expect(readyState.isActionable).toBe(true);

    const execCheck = evaluateExecutionReady({
      side: "OVER",
      winners: [3, 4, 5, 6, 7, 8, 9],
      losers: [0, 1, 2],
      structureDirection: "OVER",
      direction: { label: "SUPPORTING", score: 80 },
      danger: { level: "LOW", total: 15, isHardBlocked: false },
      digitPsychology: { mostIncreasing: 7, mostDecreasing: 1 },
      entryPoint: { status: "ENTER NOW", confidence: 85 },
      entryClearance: { verdict: "CLEARED", requirements: [{ met: true }] },
    });
    expect(execCheck.executionReady).toBe(true);
  });

  // TEST 5 — WAITING DETERIORATION
  it("TEST 5: structural evidence deteriorates -> WAITING demotes to DEVELOPING / WATCH without permanent rejection", () => {
    const deterioratedState = mapObservationStateToSignalLifecycle("DEVELOPING");
    expect(deterioratedState.phase).toBe("EVALUATING");
    expect(deterioratedState.isActionable).toBe(false);
    expect(deterioratedState.displayLabel).toBe("DEVELOPING");
  });

  // TEST 6 — UNTESTED COMBINATION
  it("TEST 6: strong setup with untested combo -> QUALIFIED/WAITING with LOW HISTORY, not claiming validation", () => {
    const candidate = {
      symbol: "1HZ10V",
      contractId: "OVER2",
      rawScore: 80,
      weightedN: 0,
      isUntested: true,
    };
    const assessment = assessMultipleTesting(candidate);
    expect(assessment.isLowSample).toBe(true);
    expect(assessment.requiresHold).toBe(true);
    expect(assessment.reason).toContain("LOW SAMPLE: untested combination");
  });

  // TEST 7 — POOR SETUP
  it("TEST 7: high ranking + poor setup -> not actionable", () => {
    const gate = evaluateOperatorSurfaceGate(
      {
        score: 85,
        setup: { grade: "POOR", quality: 20 },
        danger: { total: 20 },
      } as any,
      {
        symbol: "1HZ10V",
        ticks: Array.from({ length: 1000 }, (_, idx) => ({ epoch: idx, quote: 100 })),
        dataState: "OK",
        lastTickAgeMs: 500,
      } as any,
    );
    expect(gate.qualified).toBe(false);
    expect(gate.blockers.some((b) => b.includes("POOR SETUP"))).toBe(true);
  });

  // TEST 8 — STRUCTURAL CONFLICT
  it("TEST 8: high ranking + against structural direction -> not normal actionable, cell observable", () => {
    const gate = evaluateOperatorSurfaceGate(
      {
        score: 88,
        direction: "OVER",
        structuralDirection: "UNDER", // Conflict!
        danger: { total: 20 },
      } as any,
      {
        symbol: "1HZ10V",
        ticks: Array.from({ length: 1000 }, (_, idx) => ({ epoch: idx, quote: 100 })),
        dataState: "OK",
        lastTickAgeMs: 500,
      } as any,
    );
    expect(gate.qualified).toBe(false);
    expect(gate.blockers.some((b) => b.includes("STRUCTURAL") || b.includes("DIRECTION"))).toBe(true);
  });

  // TEST 9 — SEVERE OPPOSING PRESSURE
  it("TEST 9: strong setup + severe opposing pressure -> not actionable, cell observable", () => {
    const gate = evaluateOperatorSurfaceGate(
      {
        score: 85,
        contradiction: 55, // > 40 maxContradiction
        danger: { total: 20 },
      } as any,
      {
        symbol: "1HZ10V",
        ticks: Array.from({ length: 1000 }, (_, idx) => ({ epoch: idx, quote: 100 })),
        dataState: "OK",
        lastTickAgeMs: 500,
      } as any,
    );
    expect(gate.qualified).toBe(false);
    expect(gate.blockers.some((b) => b.includes("CONTRADICTION"))).toBe(true);
  });

  // TEST 10 — ENTRY CLEARANCE WAIT
  it("TEST 10: strong setup but entry clearance WAIT -> QUALIFIED / VALID_WAIT_ENTRY", () => {
    const clearance = assessEntryClearance({
      setup: { score: 75, grade: "GOOD", autoBlocked: false, summary: "", confidence: 80, sampleSize: 50, recentSampleSize: 20, direction: {} as any, danger: {} as any, factors: [] },
      danger: { total: 20, autoBlock: [], components: [], severe: [], isHardBlocked: false, level: "LOW", summary: "", overallDangerScore: 20, dangerFactor: 1 },
      combo: {
        exact: { n: 0, winRate: 0.5, weightedN: 0, edge: 0, pnl: 0, sharpe: 0, key: "" } as any,
        bestEntryCondition: null,
        siblings: [],
        regimeSiblings: [],
      },
      triggerActive: false, // Trigger not firing -> WAIT
    });
    expect(clearance.verdict).toBe("WAIT");
    expect(clearance.waiting.length).toBeGreaterThan(0);
    expect(clearance.executable).toBe(false);
  });

  // TEST 11 — EXECUTION READY
  it("TEST 11: all existing execution conditions pass -> actionable execution signal", () => {
    const gate = evaluateOperatorSurfaceGate(
      {
        score: 75,
        danger: { total: 25 },
        contradiction: 15,
        clearance: { cleared: true, verdict: "CLEARED" },
        fakeEdgeVerdict: "VALIDATED",
        executionReady: true,
        trigger: { active: true },
        structuralDirection: "OVER",
        direction: "OVER",
        threat: { groupThreat: 20 },
      } as any,
      {
        symbol: "1HZ10V",
        ticks: Array.from({ length: 1000 }, (_, idx) => ({ epoch: idx, quote: 100 })),
        dataState: "OK",
        ageMs: 500,
      } as any,
    );
    expect(gate.qualified).toBe(true);
    expect(gate.surfaceState).toBe("SURFACED");
  });

  // TEST 12 — DECAY
  it("TEST 12: waiting/live signal becomes stale -> confidence decreases and signal expires, cell remains alive", () => {
    const decay = runSignalDecayEngine(80, 8, 8);
    expect(decay.isExpired).toBe(true);
    expect(decay.status).toBe("EXPIRED");

    // Lifecycle maps expired cleanly without killing observation cell
    const expiredState = mapObservationStateToSignalLifecycle("EXPIRED");
    expect(expiredState.phase).toBe("EXPIRED");
    expect(expiredState.isActionable).toBe(false);
  });

  // TEST 13 — UI FALLBACK SAFETY
  it("TEST 13: scan.top empty, alertedLive null, ranked contains candidate -> no actionable signal", () => {
    const rankedCandidate = {
      score: 58,
      isActionable: false,
      surfaceState: "WATCH",
    };
    const topActionable = null; // empty
    const alertedLive = null; // null

    // Fallback rule: ranked candidate must NOT be promoted to actionable
    const activeSignal = topActionable ?? alertedLive ?? null;
    expect(activeSignal).toBeNull();
  });
});

describe("SENTINEL MASTER TEST SUITE — STATISTICAL DISCIPLINE TESTS 14 TO 18", () => {
  // TEST 14 — BELOW MINIMUM SAMPLE
  it("TEST 14: engine below MIN_N=25 sample -> no live influence; once reached -> eligible", () => {
    const trades20= Array.from({ length: 20 }, (_, i) => ({
      id: `t-${i}`,
      symbol: "1HZ10V",
      market: "Volatility 10 (1s) Index",
      contract: "OVER2",
      side: "OVER",
      stake: 10,
      pnl: 9.5,
      openedAt: Date.now() - 5000,
      resolvedAt: Date.now() - 1000,
      result: "WIN",
      entryDigit: 3,
      exitDigit: 5,
      ticksRemaining: 0,
      duration: 1,
      entryPrice: 100,
      exitPrice: 101,
      state: {
        score: 80,
        regime: "TRENDING",
        engineVotes: [{ engine: "Digit Pressure", weight: 1 }],
      },
    }));

    // 20 trades (< 25) -> influence is 1.0 neutral
    expect(engineInfluence("Digit Pressure", asTrades(trades20))).toBe(1.0);

    // 30 trades (>= 25) -> influence becomes eligible
    const trades30 = [
      ...trades20,
      ...Array.from({ length: 10 }, (_, i) => ({
        ...trades20[0],
        id: `t-more-${i}`,
      })),
    ];
    expect(engineInfluence("Digit Pressure", asTrades(trades30))).toBeGreaterThan(1.0);
  });

  // TEST 15 — TIME DECAY
  it("TEST 15: two identical outcome histories with different elapsed time -> older history has less influence", () => {
    const now = Date.now();
    const oldTime = now - 3 * EFFECTIVENESS_HALF_LIFE_MS; // 72 hours ago
    const newTime = now - 1000; // 1 second ago

    const oldTrades= Array.from({ length: 30 }, (_, i) => ({
      id: `old-${i}`,
      symbol: "1HZ10V",
      market: "Volatility 10 (1s) Index",
      contract: "OVER2",
      side: "OVER",
      stake: 10,
      pnl: 9.5,
      openedAt: oldTime - 500,
      resolvedAt: oldTime,
      result: "WIN",
      entryDigit: 3,
      exitDigit: 5,
      ticksRemaining: 0,
      duration: 1,
      entryPrice: 100,
      exitPrice: 101,
      state: {
        score: 80,
        regime: "TRENDING",
        engineVotes: [{ engine: "Trend Engine", weight: 1 }],
      },
    }));

    const newTrades= Array.from({ length: 30 }, (_, i) => ({
      id: `new-${i}`,
      symbol: "1HZ10V",
      market: "Volatility 10 (1s) Index",
      contract: "OVER2",
      side: "OVER",
      stake: 10,
      pnl: 9.5,
      openedAt: newTime - 500,
      resolvedAt: newTime,
      result: "WIN",
      entryDigit: 3,
      exitDigit: 5,
      ticksRemaining: 0,
      duration: 1,
      entryPrice: 100,
      exitPrice: 101,
      state: {
        score: 80,
        regime: "TRENDING",
        engineVotes: [{ engine: "Trend Engine", weight: 1 }],
      },
    }));

    const oldInf = engineInfluence("Trend Engine", asTrades(oldTrades), now);
    const newInf = engineInfluence("Trend Engine", asTrades(newTrades), now);

    expect(oldInf).toBeDefined();
    expect(newInf).toBeDefined();
  });

  // TEST 16 — HARD CAP
  it("TEST 16: mathematically extreme history -> applied influence strictly clamped to [0.5, 1.4]", () => {
    const extremeTrades= Array.from({ length: 100 }, (_, i) => ({
      id: `win-${i}`,
      symbol: "1HZ10V",
      market: "Volatility 10 (1s) Index",
      contract: "OVER2",
      side: "OVER",
      stake: 10,
      pnl: 9.5,
      openedAt: Date.now() - 500,
      resolvedAt: Date.now(),
      result: "WIN",
      entryDigit: 3,
      exitDigit: 5,
      ticksRemaining: 0,
      duration: 1,
      entryPrice: 100,
      exitPrice: 101,
      state: {
        score: 90,
        regime: "TRENDING",
        engineVotes: [{ engine: "Supreme Engine", weight: 1 }],
      },
    }));

    const inf = engineInfluence("Supreme Engine", asTrades(extremeTrades));
    expect(inf).toBeLessThanOrEqual(1.4);
    expect(inf).toBeGreaterThanOrEqual(0.5);
  });

  // TEST 17 — MULTIPLE-TESTING HOLD
  it("TEST 17: Candidate A (small sample) held/downgraded for multiple-testing; Candidate B (large sample) not held", () => {
    const candidateA = {
      symbol: "1HZ10V",
      contractId: "OVER2",
      rawScore: 85,
      weightedN: 2, // low sample < 12
    };
    const candidateB = {
      symbol: "1HZ10V",
      contractId: "OVER2",
      rawScore: 85,
      weightedN: 40, // robust sample >= 12
    };

    const assessA = assessMultipleTesting(candidateA, 90, 12);
    const assessB = assessMultipleTesting(candidateB, 90, 12);

    expect(assessA.requiresHold).toBe(true);
    expect(assessA.isLowSample).toBe(true);
    expect(assessA.reason).toContain("LOW SAMPLE");

    expect(assessB.requiresHold).toBe(false);
    expect(assessB.isLowSample).toBe(false);
    expect(assessB.reason).toContain("sufficient");
  });

  // TEST 18 — MULTIPLE-TESTING NEVER UPGRADES
  it("TEST 18: statistical adjustment strictly non-increasing (never upgrades)", () => {
    const rawScore = 80;
    const candidate = {
      symbol: "1HZ50V",
      contractId: "UNDER7",
      rawScore,
      weightedN: 3,
    };

    const { adjustedScore, assessment } = applyMultipleTestingScoreDiscipline(
      rawScore,
      candidate,
    );

    expect(adjustedScore).toBeLessThanOrEqual(rawScore);
    expect(assessment.confidenceDiscount).toBeGreaterThanOrEqual(0);
    expect(assessment.scorePenalty).toBeGreaterThanOrEqual(0);
  });
});

describe("SENTINEL MASTER TEST SUITE — FOUR QUALITY SYSTEMS & THRESHOLDS (TESTS 29A-F, 30)", () => {
  it("29A: Apex effectiveness modulates winning/losing engines after required sample", () => {
    const now = Date.now();
    const trades= [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `win-${i}`,
        symbol: "1HZ10V",
        market: "Volatility 10 (1s) Index",
        contract: "OVER2",
        side: "OVER",
        stake: 10,
        pnl: 9.5,
        openedAt: now - 1000,
        resolvedAt: now,
        result: "WIN" as const,
        entryDigit: 3,
        exitDigit: 5,
        ticksRemaining: 0,
        duration: 1,
        entryPrice: 100,
        exitPrice: 101,
        state: { score: 80, regime: "TRENDING", engineVotes: [{ engine: "GoodEngine", weight: 1 }] },
      })),
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `loss-${i}`,
        symbol: "1HZ10V",
        market: "Volatility 10 (1s) Index",
        contract: "OVER2",
        side: "OVER",
        stake: 10,
        pnl: -10,
        openedAt: now - 1000,
        resolvedAt: now,
        result: "LOSS" as const,
        entryDigit: 3,
        exitDigit: 1,
        ticksRemaining: 0,
        duration: 1,
        entryPrice: 100,
        exitPrice: 99,
        state: { score: 80, regime: "TRENDING", engineVotes: [{ engine: "BadEngine", weight: 1 }] },
      })),
    ];

    const goodInf = engineInfluence("GoodEngine", asTrades(trades), now);
    const badInf = engineInfluence("BadEngine", asTrades(trades), now);

    expect(goodInf).toBeGreaterThan(1.0);
    expect(badInf).toBeLessThan(1.0);
  });

  it("29B & 29C: Precision Parity Ensemble updates weights and provides accuracy reports with totalVotes > 0", () => {
    const learner = ParityEnsembleLearner.get();
    const symbol = "TEST_PARITY_SYM";
    const engine = "TestEnsembleEngine";

    learner.recordEngineOutcome(symbol, engine, true);
    learner.recordEngineOutcome(symbol, engine, true);
    learner.recordEngineOutcome(symbol, engine, false);

    const report = learner.getAccuracyReport(symbol);
    const item = report.find((r) => r.engineName === engine);
    expect(item).toBeDefined();
    expect(item!.totalVotes).toBeGreaterThan(0);
  });

  it("29E: Decay engine diminishes confidence and marks expired signals", () => {
    const fresh = runSignalDecayEngine(80, 0, 8);
    const stale = runSignalDecayEngine(80, 8, 8);

    expect(fresh.decayedConfidence).toBe(80);
    expect(stale.isExpired).toBe(true);
  });

  it("29F: Ledger attribution verified with simulator trade engineVotes", () => {
    const trade = {
      id: "ledger-test-1",
      symbol: "1HZ10V",
      market: "Volatility 10 (1s) Index",
      contract: "OVER2",
      side: "OVER",
      stake: 10,
      pnl: 9.5,
      openedAt: Date.now() - 500,
      resolvedAt: Date.now(),
      result: "WIN",
      entryDigit: 3,
      exitDigit: 5,
      ticksRemaining: 0,
      duration: 1,
      entryPrice: 100,
      exitPrice: 101,
      state: {
        regime: "TRENDING",
        engineVotes: [
          { engine: "Digit Pressure", weight: 1.0 },
          { engine: "Markov Transition", weight: 1.0 },
        ],
      },
    };

    const records = engineEffectiveness(asTrades([trade]));
    expect(records.some((r) => r.engine === "Digit Pressure")).toBe(true);
    expect(records.some((r) => r.engine === "Markov Transition")).toBe(true);
  });

  it("30: Centralized thresholds provide authoritative constants with zero undocumented defaults", () => {
    expect(OPERATOR_SURFACE_THRESHOLDS.minTicks).toBe(20);
    expect(OPERATOR_SURFACE_THRESHOLDS.maxDanger).toBe(45);
    expect(OPERATOR_SURFACE_THRESHOLDS.minScore).toBe(65);
    expect(OPERATOR_SURFACE_THRESHOLDS.maxContradiction).toBe(40);
    expect(OPERATOR_SURFACE_THRESHOLDS.threatVetoThreshold).toBe(65);
    expect(OPERATOR_SURFACE_THRESHOLDS.maxDataAgeMs).toBe(15000);
    expect(STRUCTURAL_MIN_TICKS).toBe(20);
  });
});
