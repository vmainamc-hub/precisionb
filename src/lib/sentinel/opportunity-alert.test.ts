import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALERT_CONFIG,
  EMPTY_ALERT_STATE,
  EPISODE_GRACE_MS,
  qualify,
  reduceAlerts,
  type AlertConfig,
  type AlertState,
} from "./opportunity-alert";
import type { RankedOpportunity } from "../apex/types";

const cfg: AlertConfig = { ...DEFAULT_ALERT_CONFIG, cooldownMs: 1000 };

interface Opts {
  symbol?: string;
  contract?: string;
  score?: number;
  digit?: number | null;
  confidence?: number;
  entryStatus?: string;
  changeState?: string;
  agreement?: string;
  state?: string;
  blocked?: boolean;
  clearance?: string;
  persistence?: number;
  stability?: number;
  relative?: string;
}

function mk(o: Opts = {}): RankedOpportunity {
  const digit = o.digit === undefined ? 6 : o.digit;
  return {
    symbol: o.symbol ?? "R_10",
    name: "Volatility 10",
    score: o.score ?? 74,
    agreement: o.agreement ?? "NEUTRAL",
    blocked: o.blocked ?? false,
    contract: {
      id: o.contract ?? "OVER_2",
      label: "OVER 2",
      danger: 31,
      stability: o.stability ?? 82,
      edge: 0.07,
    },
    relative: { label: o.relative ?? "STRONG" },
    persistence: { persistence: o.persistence ?? 86 },
    entryPoint: {
      status: o.entryStatus ?? "ENTER NOW",
      preferred: digit === null ? null : { digit },
      confidence: o.confidence ?? 81,
      entryMargin: 12,
      changeState: o.changeState ?? "HELD",
      window: { label: "Next 2 minutes", basis: "observed occurrences" },
    },
    entryClearance: { verdict: o.clearance ?? "CLEARED" },
    signal: {
      state: o.state ?? "VALID",
      label: `${o.state ?? "VALID"} — ENTER`,
      waitForEntry: false,
    },
  } as unknown as RankedOpportunity;
}

function run(state: AlertState, ranked: RankedOpportunity[], now: number, c = cfg) {
  return reduceAlerts(state, ranked, c, now);
}

describe("high-quality opportunity alert layer", () => {
  it("1. score 69 does not alert", () => {
    const r = run(EMPTY_ALERT_STATE, [mk({ score: 69 })], 1000);
    expect(r.fired).toHaveLength(0);
    expect(qualify(mk({ score: 69 }), cfg).ok).toBe(false);
  });

  it("2. score 70 with qualified entry and no hard invalidation alerts", () => {
    const r = run(EMPTY_ALERT_STATE, [mk({ score: 70 })], 1000);
    expect(r.fired).toHaveLength(1);
    expect(r.fired[0].kind).toBe("NEW");
    expect(r.fired[0].snapshot.entryDigit).toBe(6);
    expect(r.fired[0].snapshot.windowLabel).toBe("Next 2 minutes");
  });

  it("3 & 4. same opportunity drifting 72-76 alerts once", () => {
    let s = EMPTY_ALERT_STATE;
    let fires = 0;
    let t = 1000;
    for (const score of [75, 74, 72, 76, 73, 75]) {
      const r = run(s, [mk({ score })], (t += 5000));
      s = r.state;
      fires += r.fired.length;
    }
    expect(fires).toBe(1);
    expect(s.episode?.alerts).toBe(1);
  });

  it("5 & 6. episode closes when it stops qualifying and re-arms later", () => {
    let r = run(EMPTY_ALERT_STATE, [mk()], 1000);
    expect(r.fired).toHaveLength(1);
    r = run(r.state, [], 1000 + EPISODE_GRACE_MS + 1);
    expect(r.state.episode?.status).not.toBe("ACTIVE");
    const later = run(r.state, [mk()], 1000 + EPISODE_GRACE_MS + 60_000);
    expect(later.fired).toHaveLength(1);
    expect(later.fired[0].kind).toBe("RE-ARM");
  });

  it("7. an insignificant entry-digit reshuffle does not alert again", () => {
    const first = run(EMPTY_ALERT_STATE, [mk({ digit: 6 })], 1000);
    const next = run(first.state, [mk({ digit: 3, changeState: "HELD", score: 75 })], 60_000);
    expect(next.fired).toHaveLength(0);
  });

  it("8. a materially different actionable entry alerts again", () => {
    const first = run(EMPTY_ALERT_STATE, [mk({ digit: 6 })], 1000);
    const next = run(
      first.state,
      [mk({ digit: 3, changeState: "MATERIAL CHANGE", score: 75 })],
      60_000,
    );
    expect(next.fired).toHaveLength(1);
    expect(next.fired[0].kind).toBe("MATERIAL CHANGE");
  });

  it("9. no qualified entry digit produces no actionable alert", () => {
    expect(
      run(EMPTY_ALERT_STATE, [mk({ digit: null, entryStatus: "UNVALIDATED" })], 1000).fired,
    ).toHaveLength(0);
  });

  it("10. hard invalidation blocks the alert", () => {
    expect(run(EMPTY_ALERT_STATE, [mk({ entryStatus: "INVALIDATED" })], 1000).fired).toHaveLength(
      0,
    );
    expect(run(EMPTY_ALERT_STATE, [mk({ clearance: "BLOCKED" })], 1000).fired).toHaveLength(0);
    expect(run(EMPTY_ALERT_STATE, [mk({ agreement: "STRONG CONFLICT" })], 1000).fired).toHaveLength(
      0,
    );
    expect(
      run(EMPTY_ALERT_STATE, [mk({ blocked: true, state: "BLOCKED" })], 1000).fired,
    ).toHaveLength(0);
  });

  it("11 & 12. NEUTRAL, CONFLICT-free MODERATE and SUPPORT agreement all alert", () => {
    for (const agreement of ["NEUTRAL", "SUPPORT", "CONFLICT"]) {
      expect(run(EMPTY_ALERT_STATE, [mk({ agreement })], 1000).fired).toHaveLength(1);
    }
  });

  it("13 & 14. disabling monitoring silences the layer", () => {
    const r = run(EMPTY_ALERT_STATE, [mk()], 1000, { ...cfg, enabled: false });
    expect(r.fired).toHaveLength(0);
  });

  it("16. several qualifying markets produce one alert on the strongest", () => {
    const r = run(
      EMPTY_ALERT_STATE,
      [mk({ symbol: "R_10", score: 74 }), mk({ symbol: "R_25", score: 81 })],
      1000,
    );
    expect(r.fired).toHaveLength(1);
    expect(r.fired[0].snapshot.symbol).toBe("R_25");
  });

  it("a single-tick superior market candidate does not pre-empt; two consecutive superior samples take over", () => {
    const first = run(EMPTY_ALERT_STATE, [mk({ symbol: "R_10", score: 74 })], 1000);
    // Sample 1 of superior challenger R_50 (score 85 vs 74, delta 11 >= 6) within grace period
    const sample1 = run(
      first.state,
      [mk({ symbol: "R_10", score: 60 }), mk({ symbol: "R_50", score: 85 })],
      2500,
    );
    expect(sample1.fired).toHaveLength(0); // 1st sample does not fire (hysteresis)

    // Sample 2 where R_50 persists as superior within grace period
    const sample2 = run(
      sample1.state,
      [mk({ symbol: "R_10", score: 60 }), mk({ symbol: "R_50", score: 85 })],
      3500,
    );
    expect(sample2.fired).toHaveLength(1);
    expect(sample2.fired[0].kind).toBe("SUPERIOR MARKET");
    expect(sample2.state.episode?.snapshot.symbol).toBe("R_50");
  });

  it("score improvement requires two consecutive samples above materialScoreDelta to fire MATERIAL CHANGE", () => {
    const first = run(EMPTY_ALERT_STATE, [mk({ score: 74 })], 1000);
    expect(first.fired).toHaveLength(1);
    expect(first.fired[0].kind).toBe("NEW");

    // Single-tick spike crossing material delta: 74 -> 80 (delta 6 >= 6) at t = 60_000
    const spikeSample1 = run(first.state, [mk({ score: 80 })], 60_000);
    expect(spikeSample1.fired).toHaveLength(0); // Should not fire on first sample

    // Reverting tick: drops back to 74
    const spikeReverted = run(spikeSample1.state, [mk({ score: 74 })], 65_000);
    expect(spikeReverted.fired).toHaveLength(0); // Reverted spike ignored

    // Now test a 2-sample persistent score improvement: 74 -> 80 -> 80
    const persistSample1 = run(spikeReverted.state, [mk({ score: 80 })], 70_000);
    expect(persistSample1.fired).toHaveLength(0); // Sample 1 crossing delta

    const persistSample2 = run(persistSample1.state, [mk({ score: 80 })], 75_000);
    expect(persistSample2.fired).toHaveLength(1); // Sample 2 confirmed!
    expect(persistSample2.fired[0].kind).toBe("MATERIAL CHANGE");
    expect(persistSample2.fired[0].detail).toContain("Opportunity improved 74 → 80");
  });

  it("dip-and-recover within EPISODE_GRACE_MS preserves openedAt and does not re-alert NEW/RE-ARM", () => {
    // Pass 1 (t=1000): Opens episode
    const pass1 = run(EMPTY_ALERT_STATE, [mk({ symbol: "R_10", score: 74 })], 1000);
    expect(pass1.fired).toHaveLength(1);
    const originalOpenedAt = pass1.state.episode?.openedAt;
    expect(originalOpenedAt).toBe(1000);

    // Pass 2 (t=6000): Opportunity temporarily drops out / no markets qualify
    const pass2 = run(pass1.state, [], 6000);
    expect(pass2.fired).toHaveLength(0);
    expect(pass2.state.episode?.status).toBe("ACTIVE");
    expect(pass2.state.episode?.openedAt).toBe(1000);

    // Pass 3 (t=12000, within 20s grace): Opportunity recovers and qualifies again
    const pass3 = run(pass2.state, [mk({ symbol: "R_10", score: 74 })], 12000);
    expect(pass3.fired).toHaveLength(0); // No new or re-arm alert!
    expect(pass3.state.episode?.status).toBe("ACTIVE");
    expect(pass3.state.episode?.openedAt).toBe(originalOpenedAt);
  });

  it("surfaces qualityBand in AlertSnapshot without making it a qualification gate", () => {
    // A candidate with WEAK qualityBand should still qualify if it meets all cfg thresholds
    const weakCandidate = {
      ...mk({ score: 75 }),
      qualityBand: "WEAK" as const,
      reliabilityState: "CALIBRATED (STABLE)",
    };
    const q = qualify(weakCandidate, cfg);
    expect(q.ok).toBe(true);
    expect(q.snapshot.qualityBand).toBe("WEAK");
    expect(q.snapshot.reliabilityState).toBe("CALIBRATED (STABLE)");
    expect(q.snapshot.reasons.some((r) => r.includes("Dossier quality: WEAK"))).toBe(true);
  });

  it("verifies DEFAULT_ALERT_CONFIG values are unchanged", () => {
    expect(DEFAULT_ALERT_CONFIG).toEqual({
      enabled: true,
      minScore: 70,
      minConfidence: 65,
      minPersistence: 50,
      minStability: 50,
      requireEntryDigit: true,
      rejectBlocked: true,
      requireAgreementOrEvidencePackage: true,
      strongEntryConfidence: 70,
      blockFragileSurvival: true,
      sound: true,
      notifications: true,
      cooldownMs: 45_000,
      materialScoreDelta: 6,
    });
  });

  it("records history with the operator-facing fields", () => {
    const r = run(EMPTY_ALERT_STATE, [mk()], 1000);
    const h = r.state.history[0];
    expect(h.snapshot.persistence).toBe(86);
    expect(h.snapshot.stability).toBe(82);
    expect(h.snapshot.relativeEdge).toBe("STRONG");
    expect(h.snapshot.danger).toBe(31);
    expect(h.snapshot.reasons.length).toBeGreaterThan(3);
    expect(h.snapshot.cautions.length).toBeGreaterThan(0);
  });

  it("locks down qualify() threshold and branching behavior across all boundary conditions", () => {
    // Base object that passes all DEFAULT_ALERT_CONFIG qualification gates
    const base = mk({
      score: 75,
      confidence: 75,
      persistence: 80,
      stability: 80,
      digit: 6,
      entryStatus: "ENTER NOW",
      agreement: "SUPPORT",
      blocked: false,
      state: "VALID",
      clearance: "CLEARED",
      relative: "STRONG",
    });

    const testCases: Array<{
      name: string;
      patch: (b: RankedOpportunity) => RankedOpportunity;
      expectedOk: boolean;
      expectedFailures: string[];
    }> = [
      {
        name: "baseline qualifying candidate",
        patch: (b) => b,
        expectedOk: true,
        expectedFailures: [],
      },
      // Score boundaries (minScore = 70)
      {
        name: "score boundary: minScore - 1 (69)",
        patch: (b) => ({ ...b, score: 69 }),
        expectedOk: false,
        expectedFailures: ["Opportunity 69 below threshold 70"],
      },
      {
        name: "score boundary: exact minScore (70)",
        patch: (b) => ({ ...b, score: 70 }),
        expectedOk: true,
        expectedFailures: [],
      },
      // Confidence boundaries (minConfidence = 65)
      {
        name: "confidence boundary: minConfidence - 1 (64)",
        patch: (b) => ({ ...b, entryPoint: { ...b.entryPoint!, confidence: 64 } }),
        expectedOk: false,
        expectedFailures: ["Entry confidence 64 below 65"],
      },
      {
        name: "confidence boundary: exact minConfidence (65)",
        patch: (b) => ({ ...b, entryPoint: { ...b.entryPoint!, confidence: 65 } }),
        expectedOk: true,
        expectedFailures: [],
      },
      // Entry digit requirements (requireEntryDigit = true)
      {
        name: "entry digit: unvalidated status with no digit",
        patch: (b) => ({
          ...b,
          entryPoint: { ...b.entryPoint!, status: "UNVALIDATED", preferred: null },
        }),
        expectedOk: false,
        expectedFailures: ["No qualified entry digit (UNVALIDATED)"],
      },
      {
        name: "entry digit: missing preferred digit object",
        patch: (b) => ({
          ...b,
          entryPoint: { ...b.entryPoint!, preferred: null as any },
        }),
        expectedOk: false,
        expectedFailures: ["No qualified entry digit (ENTER NOW)"],
      },
      // Persistence boundaries (minPersistence = 50)
      {
        name: "persistence boundary: minPersistence - 1 (49)",
        patch: (b) => ({ ...b, persistence: { persistence: 49 } as any }),
        expectedOk: false,
        expectedFailures: ["Persistence 49 below 50"],
      },
      {
        name: "persistence boundary: exact minPersistence (50)",
        patch: (b) => ({ ...b, persistence: { persistence: 50 } as any }),
        expectedOk: true,
        expectedFailures: [],
      },
      // Stability boundaries (minStability = 50)
      {
        name: "stability boundary: minStability - 1 (49)",
        patch: (b) => ({
          ...b,
          contract: { ...b.contract, stability: 49 },
        }),
        expectedOk: false,
        expectedFailures: ["Stability 49 below 50"],
      },
      {
        name: "stability boundary: exact minStability (50)",
        patch: (b) => ({
          ...b,
          contract: { ...b.contract, stability: 50 },
        }),
        expectedOk: true,
        expectedFailures: [],
      },
      // Safety layer blocks (rejectBlocked = true)
      {
        name: "safety block: blocked flag = true",
        patch: (b) => ({ ...b, blocked: true }),
        expectedOk: false,
        expectedFailures: ["Signal is BLOCKED by the safety layer"],
      },
      {
        name: "safety block: signal.state = BLOCKED",
        patch: (b) => ({ ...b, signal: { ...b.signal, state: "BLOCKED" } as any }),
        expectedOk: false,
        expectedFailures: ["Signal is BLOCKED by the safety layer"],
      },
      // Hard conflicts
      {
        name: "hard conflict: agreement = STRONG CONFLICT",
        patch: (b) => ({ ...b, agreement: "STRONG CONFLICT" }),
        expectedOk: false,
        expectedFailures: ["Hard engine conflict (STRONG CONFLICT)"],
      },
      {
        name: "hard conflict: entryPoint status = INVALIDATED",
        patch: (b) => ({
          ...b,
          entryPoint: { ...b.entryPoint!, status: "INVALIDATED" },
        }),
        expectedOk: false,
        expectedFailures: [
          "No qualified entry digit (INVALIDATED)",
          "Entry-Point Engine reports the entry INVALIDATED",
        ],
      },
      {
        name: "hard conflict: entryClearance verdict = BLOCKED",
        patch: (b) => ({
          ...b,
          entryClearance: { ...b.entryClearance, verdict: "BLOCKED" },
        }),
        expectedOk: false,
        expectedFailures: ["Entry clearance verdict is BLOCKED"],
      },
      // Execution survival (blockFragileSurvival = true)
      {
        name: "fragile survival: label FRAGILE",
        patch: (b) => ({
          ...b,
          survival: {
            sufficient: true,
            label: "FRAGILE",
            lossOnFirstRunRate: 0.6,
            summary: "Loss on run 1 > 50%",
          } as any,
        }),
        expectedOk: false,
        expectedFailures: ["Execution survival is FRAGILE — Loss on run 1 > 50%"],
      },
      {
        name: "fragile survival: high loss on first run rate",
        patch: (b) => ({
          ...b,
          survival: {
            sufficient: true,
            label: "FRAGILE",
            lossOnFirstRunRate: 0.75,
            summary: "High risk first-tick drop",
          } as any,
        }),
        expectedOk: false,
        expectedFailures: ["Execution survival is FRAGILE — High risk first-tick drop"],
      },
      {
        name: "unmeasured survival: INSUFFICIENT data does not block",
        patch: (b) => ({
          ...b,
          survival: {
            sufficient: false,
            label: "INSUFFICIENT",
            lossOnFirstRunRate: 0,
            summary: "Insufficient data",
          } as any,
        }),
        expectedOk: true,
        expectedFailures: [],
      },
      // Agreement vs. Evidence Package (requireAgreementOrEvidencePackage = true)
      {
        name: "non-SUPPORT agreement (NEUTRAL) with complete evidence package qualifies",
        patch: (b) => ({
          ...b,
          agreement: "NEUTRAL",
          relative: { label: "STRONG" } as any,
          entryPoint: { ...b.entryPoint!, confidence: 75 },
        }),
        expectedOk: true,
        expectedFailures: [],
      },
      {
        name: "non-SUPPORT agreement (NEUTRAL) with MODERATE relative edge qualifies",
        patch: (b) => ({
          ...b,
          agreement: "NEUTRAL",
          relative: { label: "MODERATE" } as any,
          entryPoint: { ...b.entryPoint!, confidence: 70 },
        }),
        expectedOk: true,
        expectedFailures: [],
      },
      {
        name: "non-SUPPORT agreement (NEUTRAL) with WEAK relative edge fails package",
        patch: (b) => ({
          ...b,
          agreement: "NEUTRAL",
          relative: { label: "WEAK" } as any,
          entryPoint: { ...b.entryPoint!, confidence: 75 },
        }),
        expectedOk: false,
        expectedFailures: [
          "Neither engine agreement (SUPPORT) nor a complete evidence package (strong relative edge + strong entry evidence + non-fragile execution)",
        ],
      },
      {
        name: "non-SUPPORT agreement (NEUTRAL) with entry confidence below strongEntryConfidence (70) fails package",
        patch: (b) => ({
          ...b,
          agreement: "NEUTRAL",
          relative: { label: "STRONG" } as any,
          entryPoint: { ...b.entryPoint!, confidence: 68 },
        }),
        expectedOk: false,
        expectedFailures: [
          "Neither engine agreement (SUPPORT) nor a complete evidence package (strong relative edge + strong entry evidence + non-fragile execution)",
        ],
      },
      {
        name: "SUPPORT agreement with WEAK relative edge and 65 confidence still qualifies without independent package",
        patch: (b) => ({
          ...b,
          agreement: "SUPPORT",
          relative: { label: "WEAK" } as any,
          entryPoint: { ...b.entryPoint!, confidence: 65 },
        }),
        expectedOk: true,
        expectedFailures: [],
      },
    ];

    for (const tc of testCases) {
      const candidate = tc.patch(base);
      const res = qualify(candidate, DEFAULT_ALERT_CONFIG);
      expect(res.ok).toBe(tc.expectedOk);
      expect(res.failures).toEqual(tc.expectedFailures);
    }
  });
});
