import { describe, expect, it } from "vitest";
import { evaluateSurfaceVetting, selectSurfacedOpportunity, surfaceVetRank } from "./surface-vetting";
import type { RankedOpportunity } from "./types";

function candidate(key: string, rank: number, score = 80): RankedOpportunity {
  const [symbol, contract] = key.split("|");
  return {
    rank, symbol, name: symbol, score, preferred: false, simulator: null, simNote: "", entry: null,
    agreement: "SUPPORT", factors: [], invalidation: [], recent: null,
    clearance: {} as any, evidence: {} as any, blocked: false,
    direction: {} as any, dangerComposition: {} as any, setup: {} as any,
    entryClearance: {} as any, combination: {} as any, relative: {} as any, persistence: {} as any,
    entryPoint: {} as any, survival: null, survivalInfluence: {} as any, entryTrigger: null,
    signal: {} as any,
    digitPsychology: { score: 70, verdict: "SUPPORT" } as any,
    digitState: {} as any, priceAction: {} as any, priceActionField: {} as any,
    operatorSpecial: {} as any, convergence: {} as any,
    contract: {
      id: contract as any, label: contract, side: "OVER", barrier: 1, winners: [5,6,7,8,9],
      theoretical: .5, empirical: .6, recent: .6, micro: .6, n: 1000, edge: .1, edgeLB: .05,
      pressureAsymmetry: .2, transitionSupport: .2, compositeEdge: 10, stability: 80,
      freshness: 90, quality: 80, danger: 10, confidence: 80, opportunity: score,
      phase: "MATURE", supports: [], conflicts: [], contradiction: 5, ageTicks: 1,
      threat: { risingLosers: [], groupThreat: 5 } as any,
      critical: null, stats: null, rate: null, ensemble: null, forward: null, analogue: null,
      regimeCompatible: true, regimeNote: "", threatPenalty: 0, alerts: [],
      losingSidePressure: { risingCount: 0 } as any,
      winningSideMomentum: null, dangerComposition: null,
    } as any,
    intel: {} as any,
    observationDossier: { liquiditySweep: { confirmed: true, state: "CONFIRMED" } } as any,
  } as RankedOpportunity;
}

describe("surface vetting", () => {
  it("accepts SUPPORT + zero rising losers + threat below 10", () => {
    expect(evaluateSurfaceVetting(candidate("A|OVER1", 1)).pass).toBe(true);
  });
  it("requires psychology SUPPORT, with 65 as the boundary", () => {
    const c = candidate("A|OVER1", 1); c.digitPsychology = { score: 65, verdict: "SUPPORT" } as any;
    expect(evaluateSurfaceVetting(c).pass).toBe(true);
    c.digitPsychology = { score: 64, verdict: "NEUTRAL" } as any;
    expect(evaluateSurfaceVetting(c).pass).toBe(false);
  });
  it("rejects any gaining losing digit", () => {
    const c = candidate("A|OVER1", 1); c.contract.losingSidePressure = { risingCount: 1 } as any;
    expect(evaluateSurfaceVetting(c).pass).toBe(false);
  });
  it("uses an exclusive group-threat limit of 10", () => {
    const c = candidate("A|OVER1", 1); c.contract.threat = { risingLosers: [], groupThreat: 9.99 } as any;
    expect(evaluateSurfaceVetting(c).pass).toBe(true);
    c.contract.threat = { risingLosers: [], groupThreat: 10 } as any;
    expect(evaluateSurfaceVetting(c).pass).toBe(false);
  });
  it("preserves authoritative order and surfaces the first survivor", () => {
    const a = candidate("A|OVER1", 1); a.digitPsychology = { score: 40, verdict: "NEUTRAL" } as any;
    const b = candidate("B|OVER2", 2);
    const c = candidate("C|OVER3", 3);
    const ranked = [a,b,c];
    expect(surfaceVetRank(ranked)).toEqual([b,c]);
    expect(selectSurfacedOpportunity(ranked)).toBe(b);
    expect(ranked[0]).toBe(a);
    expect(ranked[0].rank).toBe(1);
  });
  it("fails closed when required evidence is missing", () => {
    const c = candidate("A|OVER1", 1); c.digitPsychology = null as any; c.contract.threat = null; c.contract.losingSidePressure = null;
    expect(evaluateSurfaceVetting(c).pass).toBe(false);
  });
  it("returns no surface candidate when none pass", () => {
    const a = candidate("A|OVER1", 1); a.contract.losingSidePressure = { risingCount: 1 } as any;
    const b = candidate("B|OVER2", 2); b.contract.threat = { risingLosers: [], groupThreat: 20 } as any;
    expect(selectSurfacedOpportunity([a,b])).toBeNull();
  });
});
