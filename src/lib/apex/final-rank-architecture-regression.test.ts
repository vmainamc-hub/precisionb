import { describe, expect, it } from "vitest";
import { buildFinalRank, candidateKey } from "./final-rank";

type C = any;

function c(symbol: string, overrides: C = {}): C {
  return {
    symbol,
    name: symbol,
    score: 60,
    agreement: "NEUTRAL",
    danger: 35,
    contract: { id: "OVER2", label: "Over 2", danger: 35, fakeEdge: { verdict: "VALIDATED" } },
    intel: { symbol, ticks: 1000, dataState: "ROBUST", ageMs: 0, danger: 35, entryClearance: { verdict: "CLEARED", executionReady: true } },
    executionReady: true,
    entryClearance: { verdict: "CLEARED", executionReady: true },
    clearance: { verdict: "CLEARED", cleared: true },
    finalDecision: { verdict: "CLEARED", summary: "Cleared" },
    digitPsychology: { score: 70, verdict: "SUPPORT", redSemantics: { mandatoryRedStructureFailed: false } },
    dossier: (() => {
      const proposition = "OVER2";
      return {
      cellId: `${symbol}:OVER2`,
      marketId: symbol,
      proposition,
      identity: { cellId: `${symbol}:OVER2`, marketId: symbol, proposition, side: "OVER", barrier: 2 },
      identityConformance: {
        proposition: "OVER2", greenPass: true, secondGreenPass: true, redPass: true, secondRedPass: true,
        mostIncreasingSupportsIdentity: true, mostDecreasingSupportsIdentity: true, edgeGroupPass: true,
        paceGroupPass: true, greenDecayPass: true, extremeDigitDecayPass: true, stabilityWatch: "STABLE",
        edgeGroupAvgPct: 8, hardBlocked: false, label: "FULL", explanation: [],
      },
      pressure: { raw: {
        winPressure: { measurable: true, ratePp: 3, persistence: 1, monotonicUp: true, agreement: "4/4" },
        losePressure: { measurable: true, ratePp: -3, persistence: 1, monotonicDown: true, agreement: "4/4" },
      } },
      };
    })(),
    ...overrides,
  };
}

describe("single authoritative ranking architecture", () => {
  it("keeps the strongest complete opportunity at Rank #1 even when that candidate is execution-unqualified", () => {
    const a = c("A", {
      score: 95, psychologyScore: 88, agreement: "SUPPORT", danger: 8,
      intel: { symbol: "A", ticks: 5, dataState: "THIN", ageMs: 0, danger: 8, entryClearance: { verdict: "WAIT", executionReady: false } },
      executionReady: false, entryClearance: { verdict: "WAIT", executionReady: false }, clearance: { verdict: "WAIT", cleared: false },
      digitPsychology: { score: 88, verdict: "SUPPORT", redSemantics: { mandatoryRedStructureFailed: false } },
    });
    const b = c("B", { score: 65, psychologyScore: 55, agreement: "NEUTRAL", danger: 40 });
    const { finalRank, entries } = buildFinalRank([b, a]);
    expect(candidateKey(finalRank[0])).toBe("A:OVER2");
    expect(entries.find((e) => candidateKey(e.candidate) === "A:OVER2")?.qualified).toBe(false);
    expect(entries.find((e) => candidateKey(e.candidate) === "B:OVER2")?.qualified).toBe(true);
  });

  it("does not create a second winner from qualification", () => {
    const ranked = buildFinalRank([c("A", { score: 90 }), c("B", { score: 60 })]).finalRank;
    expect(ranked.filter((x: C) => x.rank === 1)).toHaveLength(1);
    expect(ranked[0].rank).toBe(1);
  });
  it("ranks a complete five-dimension opportunity above an incomplete candidate even when the incomplete candidate has stronger partial evidence", () => {
    const complete = c("COMPLETE", { score: 60, psychologyScore: 70, agreement: "NEUTRAL", danger: 30 });
    const incomplete = c("INCOMPLETE", { score: 99, psychologyScore: 99, agreement: "SUPPORT", danger: 5 });
    delete incomplete.dossier.pressure;

    const result = buildFinalRank([incomplete, complete]);
    expect((result.finalRank[0] as C).symbol).toBe("COMPLETE");
    expect((result.finalRank[0] as C).confluence.complete).toBe(true);
    expect((result.finalRank[1] as C).confluence.complete).toBe(false);
  });

  it("does not use operator-gate qualification quality to outrank a stronger complete confluence state", () => {
    const stronger = c("STRONGER", { score: 60, psychologyScore: 90, agreement: "SUPPORT", danger: 8 });
    const weaker = c("WEAKER", { score: 99, psychologyScore: 65, agreement: "NEUTRAL", danger: 35 });
    // Make the stronger candidate execution-unqualified while preserving its
    // complete five-dimension opportunity evidence.
    stronger.intel = { symbol: "STRONGER", ticks: 5, dataState: "THIN", ageMs: 0, danger: 8, entryClearance: { verdict: "WAIT", executionReady: false } };
    stronger.executionReady = false;
    stronger.entryClearance = { verdict: "WAIT", executionReady: false };
    stronger.clearance = { verdict: "WAIT", cleared: false };

    const result = buildFinalRank([weaker, stronger]);
    expect((result.finalRank[0] as C).symbol).toBe("STRONGER");
    expect(result.entries.find((e) => (e.candidate as C).symbol === "STRONGER")?.qualified).toBe(false);
  });

});
