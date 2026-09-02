// APEX SENTINEL — GRADED EMPIRICAL CONFLUENCE — real ranking-path tests.
//
// These prove the Confluence enhancement through the ACTUAL buildFinalRank()
// path (finalRank[0]), not just the helper in isolation — see §22 of the
// empirical-confluence spec ("Test the real ranking path"). Unit tests for
// the helper itself live in confluence.test.ts.

import { describe, it, expect } from "vitest";
import { buildFinalRank, candidateKey } from "./final-rank";
import type { IdentityConformanceLabel } from "../sentinel/observation/cellIdentity";

type AnyCandidate = any;

function identityConformance(label: IdentityConformanceLabel): AnyCandidate {
  return {
    proposition: { id: "over2", label: "Over 2" },
    greenPass: label === "FULL" || label === "STRONG",
    secondGreenPass: label === "FULL",
    redPass: label !== "FAILED",
    secondRedPass: label === "FULL",
    mostIncreasingSupportsIdentity: label !== "FAILED",
    mostDecreasingSupportsIdentity: label !== "FAILED",
    edgeGroupPass: label !== "FAILED",
    paceGroupPass: label !== "FAILED",
    greenDecayPass: label !== "FAILED",
    extremeDigitDecayPass: null,
    stabilityWatch: "STABLE",
    edgeGroupAvgPct: 11.25,
    hardBlocked: false,
    label,
    explanation: [`identity conformance ${label}`],
  };
}

function pressureReading(overrides: Partial<AnyCandidate> = {}): AnyCandidate {
  return {
    measurable: true,
    ratePp: 0,
    persistence: 0.5,
    monotonicUp: false,
    monotonicDown: false,
    agreement: "2/4",
    direction: "NEUTRAL",
    movement: "STABLE",
    ...overrides,
  };
}

function intel(overrides: Partial<AnyCandidate> = {}): AnyCandidate {
  return {
    symbol: "R_100",
    name: "Volatility 100 Index",
    ticks: 1000,
    lastTickAt: Date.now() - 500,
    dataState: "ROBUST",
    danger: 20,
    entryClearance: {
      score: 90,
      verdict: "CLEARED",
      executionReady: true,
    },
    ...overrides,
  };
}

/** A fully-qualified, Stage-4-cleared candidate carrying real Confluence evidence. */
function fullCandidate(
  symbol: string,
  opts: {
    psychologyScore: number;
    winPressure?: AnyCandidate;
    losePressure?: AnyCandidate;
    agreement: "SUPPORT" | "NEUTRAL" | "CONFLICT" | "STRONG CONFLICT";
    dangerTotal: number;
    score?: number;
    structuralFail?: boolean;
  },
): AnyCandidate {
  return {
    symbol,
    name: symbol,
    score: opts.score ?? 75,
    agreement: opts.agreement,
    finalDecision: { verdict: "CLEARED", summary: "Cleared" },
    executionReady: true,
    danger: opts.dangerTotal,
    dangerComposition: { total: opts.dangerTotal, level: "LOW", isHardBlocked: false },
    digitPsychology: {
      score: opts.psychologyScore,
      verdict: "SUPPORT",
      redSemantics: { mandatoryRedStructureFailed: Boolean(opts.structuralFail) },
    },
    contract: {
      id: "over2",
      label: "Over 2",
      danger: opts.dangerTotal,
      fakeEdge: { verdict: "VALIDATED" },
    },
    dossier: (() => {
      const proposition = { id: "over2", label: "Over 2" };
      return {
        cellId: `${symbol}:OVER2`,
        marketId: symbol,
        proposition,
        identity: {
          cellId: `${symbol}:OVER2`,
          marketId: symbol,
          proposition,
          side: "OVER",
          barrier: 2,
        },
        identityConformance: identityConformance("FULL"),
      pressure: {
        raw: {
          winPressure: opts.winPressure ?? pressureReading(),
          losePressure: opts.losePressure ?? pressureReading(),
        },
      },
      };
    })(),
    intel: intel({ symbol, name: symbol }),
    entryClearance: { score: 90, verdict: "CLEARED", executionReady: true },
    clearance: { verdict: "CLEARED", cleared: true },
  };
}

describe("buildFinalRank — graded empirical confluence (real ranking path)", () => {
  it("TEST 1 (integration) — maximum confluence candidate stamps a HIGH/MAXIMUM confluence level on Rank #1", () => {
    const strong = fullCandidate("R_STRONG", {
      psychologyScore: 82,
      winPressure: pressureReading({ ratePp: 3, persistence: 1, monotonicUp: true, agreement: "4/4", direction: "STRONGLY_INCREASING" }),
      losePressure: pressureReading({ ratePp: -3, persistence: 1, monotonicDown: true, direction: "STRONGLY_DECREASING" }),
      agreement: "SUPPORT",
      dangerTotal: 8,
      score: 80,
    });
    const weak = fullCandidate("R_WEAK", {
      psychologyScore: 50,
      agreement: "NEUTRAL",
      dangerTotal: 40,
      score: 60,
    });

    const { finalRank } = buildFinalRank([weak, strong]);
    expect(candidateKey(finalRank[0])).toBe(candidateKey(strong));
    expect(["HIGH", "MAXIMUM"]).toContain((finalRank[0] as AnyCandidate).confluence.level);
  });

  it("TEST 18 (integration) — Confluence prefers strong simultaneous convergence over psychology alone (§18 example)", () => {
    // A: lower psychology, but winning↑/losing↓, engine SUPPORT, danger LOW.
    const a = fullCandidate("A", {
      psychologyScore: 68,
      winPressure: pressureReading({ ratePp: 2.2, persistence: 0.9, monotonicUp: true, agreement: "4/4" }),
      losePressure: pressureReading({ ratePp: -2.2, persistence: 0.9, monotonicDown: true }),
      agreement: "SUPPORT",
      dangerTotal: 10,
      score: 75, // tie the raw opportunity score so only Confluence can decide
    });
    // B: higher psychology alone, everything else weak/adverse.
    const b = fullCandidate("B", {
      psychologyScore: 78,
      winPressure: pressureReading({ ratePp: 0, persistence: 0.4 }),
      losePressure: pressureReading({ ratePp: 1.5, persistence: 0.6 }),
      agreement: "NEUTRAL",
      dangerTotal: 55,
      score: 75,
    });

    const { finalRank } = buildFinalRank([b, a]);
    expect(candidateKey(finalRank[0])).toBe(candidateKey(a));
  });

  it("TEST 9 — structural veto cannot be overridden by maximum confluence", () => {
    const vetoed = fullCandidate("R_VETO", {
      psychologyScore: 90,
      winPressure: pressureReading({ ratePp: 3, persistence: 1, monotonicUp: true, agreement: "4/4" }),
      losePressure: pressureReading({ ratePp: -3, persistence: 1, monotonicDown: true }),
      agreement: "SUPPORT",
      dangerTotal: 5,
      score: 95,
      structuralFail: true, // mandatory RED structure failure
    });
    const clean = fullCandidate("R_CLEAN", {
      psychologyScore: 65,
      agreement: "NEUTRAL",
      dangerTotal: 30,
      score: 70,
    });

    const { finalRank } = buildFinalRank([vetoed, clean]);
    // Mandatory RED structure failure outranks everything below it (tier 2),
    // above Confluence (tier 5) — maximum Confluence cannot rescue it.
    expect(candidateKey(finalRank[0])).toBe(candidateKey(clean));
  });

  it("TEST 12 — maximum confluence may make an unqualified candidate Rank #1; qualification does not replace it", () => {
    const strongestUnqualified = fullCandidate("R_TOP", {
      psychologyScore: 85,
      winPressure: pressureReading({ ratePp: 3, persistence: 1, monotonicUp: true, agreement: "4/4" }),
      losePressure: pressureReading({ ratePp: -3, persistence: 1, monotonicDown: true }),
      agreement: "SUPPORT",
      dangerTotal: 5,
      score: 92,
    });
    strongestUnqualified.intel = intel({ symbol: "R_TOP", ticks: 5, dataState: "THIN" });
    strongestUnqualified.executionReady = false;

    const weakerQualified = fullCandidate("R_LOW", {
      psychologyScore: 50,
      agreement: "NEUTRAL",
      dangerTotal: 40,
      score: 70, // above the operator minimum so this candidate genuinely qualifies
    });

    const { finalRank, entries } = buildFinalRank([weakerQualified, strongestUnqualified]);
    expect(candidateKey(finalRank[0])).toBe(candidateKey(strongestUnqualified));
    expect(entries.find((e) => candidateKey(e.candidate) === candidateKey(strongestUnqualified))?.qualified).toBe(false);
    expect(entries.find((e) => candidateKey(e.candidate) === candidateKey(weakerQualified))?.qualified).toBe(true);
  });

  it("TEST 16/17 — rank numbers are contiguous and finalRank[0] carries a confluence diagnostic", () => {
    const a = fullCandidate("A", { psychologyScore: 70, agreement: "SUPPORT", dangerTotal: 15, score: 80 });
    const b = fullCandidate("B", { psychologyScore: 60, agreement: "NEUTRAL", dangerTotal: 30, score: 70 });
    const c = fullCandidate("C", { psychologyScore: 50, agreement: "CONFLICT", dangerTotal: 50, score: 60 });

    const { finalRank } = buildFinalRank([c, a, b]);
    expect(finalRank.map((r: AnyCandidate) => r.rank)).toEqual([1, 2, 3]);
    expect(finalRank[0].confluence).toBeDefined();
    expect(typeof finalRank[0].confluence.score).toBe("number");
  });

  it("TEST 13 — no second ranking is introduced: only finalRank[0] carries rank 1", () => {
    const a = fullCandidate("A", { psychologyScore: 90, agreement: "SUPPORT", dangerTotal: 5, score: 95 });
    const b = fullCandidate("B", { psychologyScore: 40, agreement: "STRONG CONFLICT", dangerTotal: 80, score: 30 });
    const { finalRank } = buildFinalRank([a, b]);
    const rank1 = finalRank.filter((r: AnyCandidate) => r.rank === 1);
    expect(rank1).toHaveLength(1);
    expect((finalRank[0] as AnyCandidate).confluenceRank).toBeUndefined();
    expect((finalRank[0] as AnyCandidate).bestConfluenceCandidate).toBeUndefined();
  });

  it("TEST 18 — determinism: identical population produces identical ordering and confluence scores", () => {
    const pop = () => [
      fullCandidate("A", { psychologyScore: 70, winPressure: pressureReading({ ratePp: 1.2, persistence: 0.7 }), agreement: "SUPPORT", dangerTotal: 15, score: 80 }),
      fullCandidate("B", { psychologyScore: 60, agreement: "NEUTRAL", dangerTotal: 30, score: 70 }),
      fullCandidate("C", { psychologyScore: 50, agreement: "CONFLICT", dangerTotal: 50, score: 60 }),
    ];

    const r1 = buildFinalRank(pop()).finalRank.map((c: AnyCandidate) => [candidateKey(c), c.confluence.score]);
    const r2 = buildFinalRank(pop()).finalRank.map((c: AnyCandidate) => [candidateKey(c), c.confluence.score]);
    const r3 = buildFinalRank(pop().reverse()).finalRank.map((c: AnyCandidate) => [candidateKey(c), c.confluence.score]);

    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
  });
});
