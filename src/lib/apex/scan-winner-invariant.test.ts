import { describe, it, expect } from "vitest";
import { selectScanCandidate } from "@/lib/apex/scan-presentation";
import { selectSurfacedOpportunity, surfaceVetRank } from "@/lib/apex/surface-vetting";
import { apexCore } from "@/lib/apex/core";
import { derivBus } from "@/lib/deriv/tick-bus";
import { rankOpportunities, DEFAULT_SCAN_OPTIONS, scanNow } from "@/lib/apex/scan";
import type { RankedOpportunity, ScanResult } from "@/lib/apex/types";

/**
 * FINAL SCAN WINNER CONTRACT
 * `finalRank` stays the ONE authoritative ranking. The candidate presented to
 * the operator (and used by Scan) is the FIRST SURVIVOR of the mandatory
 * surface gate in that same order — never a qualification/top subset leader.
 */

function cell(
  symbol: string,
  opts: {
    qualified: boolean;
    score: number;
    conformance?: string;
    danger?: number;
    psychology?: { score: number; verdict: string };
    risingCount?: number;
    groupThreat?: number;
    sweepState?: "CONFIRMED" | "TRANSITION" | "BUILDING" | "INSUFFICIENT";
  },
): RankedOpportunity {
  return {
    symbol,
    name: symbol,
    score: opts.score,
    rank: 0,
    blocked: !opts.qualified,
    executionReady: opts.qualified,
    executionReadyReasons: [],
    contract: {
      id: `${symbol}-C`,
      label: `${symbol} contract`,
      confidence: opts.score,
      edge: 0.1,
      edgeLB: 0.05,
      quality: opts.score,
      stability: opts.score,
      freshness: 90,
      danger: opts.danger ?? 10,
      contradiction: 5,
      phase: "STABLE",
      n: 1000,
      threat: { risingLosers: [], groupThreat: opts.groupThreat ?? 5 },
      losingSidePressure: { risingCount: opts.risingCount ?? 0 },
    },
    digitPsychology: opts.psychology ?? { score: 80, verdict: "SUPPORT" },
    intel: { regime: { label: "TREND" } },
    identityConformance: { state: opts.conformance ?? "STRONG" },
    finalDecision: { verdict: opts.qualified ? "CLEARED" : "BLOCKED", summary: "test" },
    observationQualification: { qualified: opts.qualified },
    observationDossier: {
      liquiditySweep: {
        state: opts.sweepState ?? "CONFIRMED",
        confirmed: (opts.sweepState ?? "CONFIRMED") === "CONFIRMED",
      },
    },
  } as unknown as RankedOpportunity;
}

function fakeScan(finalRank: RankedOpportunity[], qualified: RankedOpportunity[]): ScanResult {
  return {
    scannedAt: Date.now(),
    marketsOnline: 1,
    marketsTotal: 1,
    evaluated: finalRank.length,
    globalDanger: 10,
    globalDangerLabel: "CALM",
    top: qualified,
    finalRank,
    surfaceRank: surfaceVetRank(finalRank),
    surfacedOpportunity: selectSurfacedOpportunity(finalRank),
    bestOf90: finalRank[0] ? ({ candidate: finalRank[0] } as ScanResult["bestOf90"]) : null,
    best: finalRank[0] ?? null,
    rejected: [],
    verdict: qualified.length ? "OPPORTUNITY" : "NONE",
    message: "",
  } as ScanResult;
}

describe("Surface admission — first surviving ranked candidate is displayed", () => {
  it("keeps an unqualified but surface-clean Rank #1 and never promotes a qualified Rank #2", () => {
    const cellA = cell("CELL_A", { qualified: false, score: 88 });
    const cellB = cell("CELL_B", { qualified: true, score: 71 });
    const scan = fakeScan([cellA, cellB], [cellB]);

    const displayed = selectScanCandidate(scan, [cellB, cellA]);

    expect(displayed).toBe(cellA);
    expect(displayed).toBe(scan.finalRank![0]);
    expect(displayed!.executionReady).toBe(false);
  });

  it("skips a Rank #1 that fails the surface gate and surfaces Rank #2", () => {
    const cellA = cell("CELL_A", { qualified: false, score: 88, risingCount: 1 });
    const cellB = cell("CELL_B", { qualified: true, score: 71 });
    const scan = fakeScan([cellA, cellB], [cellB]);

    const displayed = selectScanCandidate(scan, [cellA, cellB]);

    expect(displayed).toBe(cellB);
    expect(displayed).not.toBe(scan.finalRank![0]);
    // The authoritative ranking is untouched.
    expect(scan.finalRank![0]).toBe(cellA);
  });

  it("returns no displayed opportunity when no ranked candidate passes", () => {
    const cellA = cell("CELL_A", { qualified: false, score: 80, risingCount: 1 });
    const cellB = cell("CELL_B", { qualified: false, score: 60, groupThreat: 10 });
    const scan = fakeScan([cellA, cellB], []);

    expect(scan.surfaceRank).toEqual([]);
    expect(selectScanCandidate(scan, [cellA, cellB])).toBeNull();
  });

  it("fails the surface gate when the observed sweep is not CONFIRMED", () => {
    const cellA = cell("CELL_A", { qualified: true, score: 88, sweepState: "TRANSITION" });
    const cellB = cell("CELL_B", { qualified: true, score: 71 });
    const scan = fakeScan([cellA, cellB], [cellA, cellB]);

    expect(scan.surfaceRank).toEqual([cellB]);
    expect(selectScanCandidate(scan, [cellA, cellB])).toBe(cellB);
    // Vetting only filters — finalRank order is untouched.
    expect(scan.finalRank![0]).toBe(cellA);
  });

  it("prefers the continuous live surfaced signal over the scan snapshot", () => {
    const live = cell("LIVE", { qualified: true, score: 50 });
    const scanned = cell("SCANNED", { qualified: true, score: 90 });
    const scan = fakeScan([scanned], [scanned]);
    expect(selectScanCandidate(scan, [scanned], live)).toBe(live);
    expect(selectScanCandidate(null, [live], live)).toBe(live);
    expect(selectScanCandidate(null, [], null)).toBeNull();
  });
});

describe("Scan winner invariant — real scan pipeline", () => {
  it("scanNow preserves finalRank as authoritative and separately snapshots the surface", () => {
    const ticks: { t: number; price: number }[] = [];
    let price = 1000.5;
    const nowMs = Date.now();
    for (let i = 0; i < 1000; i++) {
      price += (Math.random() - 0.49) * 0.5;
      ticks.push({ t: nowMs - 1_000_000 + i * 1000, price });
    }
    apexCore.retain();
    derivBus.setBuffer("R_100", ticks);
    apexCore.analyse("R_100");
    const intels = apexCore.getAll();

    const opts = { ...DEFAULT_SCAN_OPTIONS, minTicks: 10 };
    // sanity: the ranking engine produces a population
    expect(rankOpportunities(intels, opts).ranked.length).toBeGreaterThan(0);

    const scan = scanNow(intels, opts);
    expect(scan.finalRank && scan.finalRank.length).toBeGreaterThan(0);
    const rank1 = scan.finalRank![0];

    expect(scan.bestOf90?.candidate).toBe(rank1);
    expect(scan.best).toBe(rank1);
    expect(scan.surfaceRank).toBeDefined();

    const expectedSurface = scan.surfacedOpportunity ?? null;
    expect(selectScanCandidate(scan, [])).toBe(expectedSurface);
    if (expectedSurface) {
      expect(scan.finalRank!.indexOf(expectedSurface)).toBeGreaterThanOrEqual(0);
      expect(scan.surfaceRank![0]).toBe(expectedSurface);
    }
  });
});
