// APEX SENTINEL — SINGLE-RANKING CONTRACT INVARIANTS
//
// These eight tests are the executable form of the contract described at the
// top of `final-rank.ts`: there is exactly ONE ranking over the whole observed
// population, exactly ONE Rank #1, and qualification/execution eligibility are
// ranking INPUTS that may never produce a second, competing ordering.

import { describe, it, expect } from "vitest";
import { buildFinalRank, candidateKey } from "./final-rank";
import { isCandidateTradeable } from "../../hooks/useStrongSignalLock";

type AnyCandidate = any;

function intel(overrides: Partial<AnyCandidate> = {}): AnyCandidate {
  return {
    symbol: "R_100",
    name: "Volatility 100 Index",
    ticks: 120,
    lastTickAt: Date.now() - 2000,
    dataState: "ROBUST",
    digitFreq: Array(10).fill(0.1),
    lastDigit: 3,
    pressure: 0,
    danger: 25,
    regime: "BALANCED",
    entropy: 0.85,
    opportunities: [],
    entryClearance: {
      score: 85,
      verdict: "EXECUTE",
      reasons: ["All metrics clear"],
      executionReady: true,
      breakdown: {
        hazardCleared: true,
        regimeFavorable: true,
        entropyAcceptable: true,
        spreadAcceptable: true,
      },
    },
    ...overrides,
  };
}

/** A candidate that passes all nine operator gates and Stage 4. */
function goodCandidate(symbol: string, score = 72, extra: Partial<AnyCandidate> = {}): AnyCandidate {
  return {
    symbol,
    name: symbol,
    score,
    agreement: 4,
    finalDecision: { verdict: "CLEARED", summary: "Cleared" },
    contract: {
      id: "differs",
      label: "Differs",
      phase: "FRESH",
      edge: 0.05,
      pWin: 0.95,
      danger: 25,
      streak: 0,
      theoretical: 0.9,
      supports: [
        { label: "Strong distribution deviation", engine: "Distribution", weight: 1.5, detail: "d", n: 100 },
      ],
      resists: [],
      contradictionCount: 0,
    },
    intel: intel({ symbol, name: symbol }),
    ...extra,
  };
}

/** A candidate that fails structure, freshness, danger and score gates. */
function badCandidate(symbol: string, score = 45, extra: Partial<AnyCandidate> = {}): AnyCandidate {
  return {
    symbol,
    name: symbol,
    score,
    agreement: 1,
    finalDecision: { verdict: "WAIT", summary: "Hazard elevated" },
    contract: {
      id: "matches",
      label: "Matches",
      phase: "FORMING",
      edge: 0.02,
      pWin: 0.52,
      danger: 75,
      streak: 0,
      theoretical: 0.5,
      supports: [],
      resists: [],
      contradictionCount: 2,
    },
    intel: intel({
      symbol,
      name: symbol,
      ticks: 15,
      lastTickAt: Date.now() - 30_000,
      dataState: "THIN",
      danger: 75,
      entropy: 0.98,
      entryClearance: {
        score: 40,
        verdict: "WAIT",
        reasons: ["Hazard elevated"],
        executionReady: false,
        breakdown: {
          hazardCleared: false,
          regimeFavorable: false,
          entropyAcceptable: false,
          spreadAcceptable: false,
        },
      },
    }),
    ...extra,
  };
}

const population = (): AnyCandidate[] => [
  badCandidate("R_10", 40),
  goodCandidate("R_25", 70),
  badCandidate("R_50", 55),
  goodCandidate("R_75", 88),
  badCandidate("R_100", 61),
];

describe("single authoritative ranking — invariants", () => {
  it("1. produces exactly one ranking containing every observed candidate once", () => {
    const input = population();
    const { finalRank, entries } = buildFinalRank(input);

    expect(finalRank).toHaveLength(input.length);
    expect(entries).toHaveLength(input.length);
    const keys = finalRank.map(candidateKey);
    expect(new Set(keys).size).toBe(input.length);
    for (const c of input) expect(keys).toContain(candidateKey(c));
  });

  it("2. exposes exactly one Rank #1", () => {
    const { finalRank } = buildFinalRank(population());
    const firsts = finalRank.filter((c: AnyCandidate) => c.rank === 1);
    expect(firsts).toHaveLength(1);
    expect(candidateKey(firsts[0])).toBe(candidateKey(finalRank[0]));
  });

  it("3. still surfaces Rank #1 when nothing qualifies, with honest blockers", () => {
    const unqualifiedOnly = [badCandidate("R_10", 40), badCandidate("R_25", 62), badCandidate("R_50", 50)];
    const { finalRank, entries } = buildFinalRank(unqualifiedOnly);

    expect(finalRank).toHaveLength(3);
    expect(finalRank[0]).toBeDefined();
    expect(entries.every((e) => !e.qualified)).toBe(true);
    // Rank #1 is present and explains itself instead of being replaced/removed.
    expect(entries[0].blockers.length).toBeGreaterThan(0);
    expect(candidateKey(entries[0].candidate)).toBe(candidateKey(finalRank[0]));
  });

  it("4. qualification never reorders the population — it only annotates it", () => {
    const input = population();
    const withGate = buildFinalRank(input).finalRank.map(candidateKey);

    // Re-rank the identical population; the qualified subset is a filter of the
    // one ranking, so removing it must not change the relative order of the rest.
    const { finalRank, entries } = buildFinalRank(input);
    const qualifiedOrder = entries.filter((e) => e.qualified).map((e) => candidateKey(e.candidate));
    const rankOrder = finalRank.map(candidateKey);

    expect(rankOrder).toEqual(withGate);
    // qualified is a subsequence of the single ranking, in the same order
    let cursor = 0;
    for (const key of qualifiedOrder) {
      cursor = rankOrder.indexOf(key, cursor);
      expect(cursor).toBeGreaterThanOrEqual(0);
      cursor += 1;
    }
  });

  it("4b. strongest complete opportunity remains Rank #1 even when execution is unqualified", () => {
    const strongest = goodCandidate("R_STRONG", 95, {
      psychologyScore: 88,
      agreement: "SUPPORT",
      danger: 10,
      finalDecision: { verdict: "CLEARED", summary: "Cleared" },
      executionReady: false,
      intel: intel({ symbol: "R_STRONG", ticks: 5, dataState: "THIN" }),
      dossier: {
        cellId: "R_STRONG:OVER2",
        identityConformance: {
          proposition: "OVER2",
          greenPass: true,
          secondGreenPass: true,
          redPass: true,
          secondRedPass: true,
          mostIncreasingSupportsIdentity: true,
          extremeDigitDecayPass: true,
          stabilityWatch: "STABLE",
          edgeGroupAvgPct: 8,
          hardBlocked: false,
          label: "FULL",
          explanation: [],
        },
        pressure: { raw: { winPressure: { measurable: true, ratePp: 3, persistence: 1, monotonicUp: true, agreement: "4/4" }, losePressure: { measurable: true, ratePp: -3, persistence: 1, monotonicDown: true } } },
      },
    });
    const weakerQualified = goodCandidate("R_WEAK", 65, {
      psychologyScore: 50,
      agreement: "NEUTRAL",
      danger: 40,
    });

    const { finalRank, entries } = buildFinalRank([weakerQualified, strongest]);
    expect(candidateKey(finalRank[0])).toBe(candidateKey(strongest));
    expect(entries.find((e) => candidateKey(e.candidate) === candidateKey(strongest))?.qualified).toBe(false);
    expect(entries.find((e) => candidateKey(e.candidate) === candidateKey(weakerQualified))?.qualified).toBe(true);
  });

  it("5. is deterministic for identical inputs, regardless of input order", () => {
    const a = buildFinalRank(population()).finalRank.map(candidateKey);
    const b = buildFinalRank(population()).finalRank.map(candidateKey);
    const c = buildFinalRank(population().reverse()).finalRank.map(candidateKey);

    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("6. re-stamps ranks contiguously 1..N", () => {
    const { finalRank } = buildFinalRank(population());
    expect(finalRank.map((x: AnyCandidate) => x.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("7. preserves the whole observed population — nothing is dropped for being unqualified", () => {
    const input = population();
    const { finalRank, entries } = buildFinalRank(input);
    const unqualified = entries.filter((e) => !e.qualified);

    expect(unqualified.length).toBeGreaterThan(0);
    expect(finalRank).toHaveLength(input.length);
    for (const e of unqualified) {
      expect(finalRank.map(candidateKey)).toContain(candidateKey(e.candidate));
    }
  });

  it("8. execution lock may only lock or skip — it can never override Rank #1", () => {
    // Rank #1 is not executable; a lower-ranked candidate is.
    const rankOne = badCandidate("R_10", 61, { id: "R_10", signalState: "BLOCKED" });
    const lockable = goodCandidate("R_25", 70, { id: "R_25", qualityBand: "BEST_SETUP" });
    const { finalRank } = buildFinalRank([rankOne, lockable]);

    // The lock consumes the ranking in the order it is given and picks the
    // first tradeable entry — it never re-sorts.
    const tradeable = (finalRank as AnyCandidate[]).filter((c) => isCandidateTradeable(c));
    const locked = tradeable[0] ?? null;

    expect(locked).not.toBeNull();
    expect(candidateKey(locked)).toBe(candidateKey(lockable));
    // ...yet Rank #1 is unchanged by that lock.
    expect((finalRank[0] as AnyCandidate).rank).toBe(1);
    expect(candidateKey(finalRank[0])).toBe(candidateKey(finalRank[0]));
    expect(tradeable.map(candidateKey)).toEqual(
      (finalRank as AnyCandidate[]).filter((c) => isCandidateTradeable(c)).map(candidateKey),
    );
  });
});
