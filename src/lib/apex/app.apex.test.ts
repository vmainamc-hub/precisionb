import { describe, it, expect } from "vitest";
import { apexCore } from "@/lib/apex/core";
import { derivBus } from "@/lib/deriv/tick-bus";
import { rankOpportunities, DEFAULT_SCAN_OPTIONS, whyNotRunnerUp } from "@/lib/apex/scan";
import { mapIntelToObservationInputs, observationEngine } from "@/lib/sentinel/observation";
import {
  reduceAlerts,
  DEFAULT_ALERT_CONFIG,
  EMPTY_ALERT_STATE,
} from "@/lib/sentinel/opportunity-alert";
import { psychologyEngine } from "@/lib/apex/psychology";

describe("Apex & Sentinel Initialization & Rendering smoke test", () => {
  it("initializes apex core without throwing", () => {
    apexCore.retain();
    const intels = apexCore.getAll();
    expect(Array.isArray(intels)).toBe(true);
  });

  it("ranks opportunities even when intels are empty or thin", () => {
    const intels = apexCore.getAll();
    const ranked = rankOpportunities(intels, DEFAULT_SCAN_OPTIONS);
    expect(ranked).toBeDefined();
    expect(Array.isArray(ranked.ranked)).toBe(true);
  });

  it("reduces alerts without throwing", () => {
    const intels = apexCore.getAll();
    const ranked = rankOpportunities(intels, DEFAULT_SCAN_OPTIONS).ranked;
    const res = reduceAlerts(EMPTY_ALERT_STATE, ranked, DEFAULT_ALERT_CONFIG, Date.now());
    expect(res).toBeDefined();
  });

  it("handles deep ticks and complex market intelligence without throwing", () => {
    // Feed 1000 ticks into derivBus for R_100
    const ticks = [];
    let price = 1000.5;
    const nowMs = Date.now();
    for (let i = 0; i < 1000; i++) {
      price += (Math.random() - 0.49) * 0.5;
      ticks.push({
        t: nowMs - 1000000 + i * 1000,
        price,
      });
    }

    apexCore.retain();
    // Simulate derivBus delivering ticks for R_100
    derivBus.setBuffer("R_100", ticks);

    // Call analyse on R_100
    apexCore.analyse("R_100");

    const intels = apexCore.getAll();
    expect(intels.length).toBeGreaterThan(0);
    const intelR100 = intels.find((i) => i.symbol === "R_100");
    expect(intelR100).toBeDefined();

    const ranked = rankOpportunities(intels, { ...DEFAULT_SCAN_OPTIONS, minTicks: 10 });
    console.log(
      "intelR100 dataState:",
      intelR100?.dataState,
      "ticks:",
      intelR100?.ticks,
      "rejected:",
      ranked.rejected,
    );
    expect(ranked.ranked.length).toBeGreaterThan(0);
    const best = ranked.ranked[0];
    expect(best).toBeDefined();

    if (ranked.ranked.length > 1) {
      const whyLines = whyNotRunnerUp(best, ranked.ranked[1]);
      expect(Array.isArray(whyLines)).toBe(true);
    }
  });

  it("verifies end-to-end integration between ObservationEngine and rankOpportunities", () => {
    // 1. Ingest simulated raw digit sequence through mapIntelToObservationInputs
    const ticks = [];
    let price = 5000.25;
    const nowMs = Date.now();
    for (let i = 0; i < 1000; i++) {
      price += (Math.random() - 0.49) * 0.5;
      ticks.push({
        t: nowMs - 1000000 + i * 1000,
        price,
      });
    }

    apexCore.retain();
    derivBus.setBuffer("R_50", ticks);
    apexCore.analyse("R_50");

    const intels = apexCore.getAll();
    const intelR50 = intels.find((i) => i.symbol === "R_50");
    expect(intelR50).toBeDefined();

    // 2. Map intel and ingest into ObservationEngine
    const deepDigits = apexCore.getDeepDigits("R_50");
    const inputs = mapIntelToObservationInputs(intelR50, deepDigits);
    expect(inputs.length).toBeGreaterThan(0);

    for (const input of inputs) {
      const dossier = observationEngine.ingest(input);
      expect(dossier).toBeDefined();
      expect(typeof dossier.score).toBe("number");
      expect(dossier.factors).toBeDefined();
      expect(Array.isArray(dossier.factors)).toBe(true);
      // Verify factors list is non-empty
      expect(dossier.factors!.length).toBeGreaterThan(0);
    }

    // 3. Assert rankOpportunities matches getAllRanked cell-for-cell in score,
    //    identity and blocked state. Stage 4 now applies a HIERARCHICAL final
    //    ordering (verdict precedence -> mandatory RED structure -> psychology
    //    -> raw score), so the two lists may differ in position; parity is
    //    asserted per cell (same universe, same score, same blocked state) and
    //    the score multiset is still required to match exactly.
    const allRanked = observationEngine.getAllRanked();
    expect(allRanked.length).toBeGreaterThan(0);

    const { ranked } = rankOpportunities(intels, { ...DEFAULT_SCAN_OPTIONS, minTicks: 10 });
    expect(ranked.length).toBe(allRanked.length);

    const byCell = new Map(ranked.map((r) => [`${r.symbol}:${r.contract.id}`, r]));
    for (const d of allRanked) {
      const r = byCell.get(`${d.marketId}:${d.proposition}`);
      expect(r).toBeDefined();
      expect(r!.score).toBe(d.score);
      const isBlocked = Boolean(
        d.veto?.hard || d.danger?.isHardBlocked || (d.veto?.active && d.veto?.hard),
      );
      expect(r!.blocked).toBe(isBlocked);
    }

    expect([...ranked].map((r) => r.score).sort((a, b) => b - a)).toEqual(
      allRanked.map((d) => d.score).sort((a, b) => b - a),
    );

    // 4. Verify hard-vetoed cells are pushed to the bottom
    let seenBlocked = false;
    for (const d of allRanked) {
      const isBlocked = Boolean(
        d.veto?.hard || d.danger?.isHardBlocked || (d.veto?.active && d.veto?.hard),
      );
      if (isBlocked) {
        seenBlocked = true;
      } else {
        expect(seenBlocked).toBe(false);
      }
    }
  });
});
