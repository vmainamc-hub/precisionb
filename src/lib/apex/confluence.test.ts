// APEX SENTINEL — GRADED EMPIRICAL CONFLUENCE — unit tests for the helper.
//
// These test computeConfluenceCore() directly, in isolation, against
// synthetic evidence shaped like the real Sentinel telemetry it reads.
// See final-rank-confluence.test.ts for the same behaviour proven through
// the real buildFinalRank() -> finalRank[0] path.

import { describe, it, expect } from "vitest";
import { computeConfluenceCore, CONFLUENCE_PSYCHOLOGY_THRESHOLD } from "./confluence";
import type { IdentityConformanceLabel } from "../sentinel/observation/cellIdentity";

type AnyCandidate = any;

/** Minimal synthetic IdentityConformance for confluence-layer tests. */
function identityConformance(label: IdentityConformanceLabel, hardBlocked = false): AnyCandidate {
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
    stabilityWatch: label === "FAILED" ? "RAPIDLY_INCREASING" : "STABLE",
    edgeGroupAvgPct: 11.25,
    hardBlocked,
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

/** A fully-formed candidate for a chosen point along the empirical pattern. */
function candidate(opts: {
  psychologyScore?: number | null;
  winPressure?: AnyCandidate | null;
  losePressure?: AnyCandidate | null;
  agreement?: string;
  dangerTotal?: number | null;
  dangerHardBlocked?: boolean;
  identityLabel?: IdentityConformanceLabel | null;
  identityHardBlocked?: boolean;
}): AnyCandidate {
  const needsDossier =
    opts.winPressure !== undefined || opts.losePressure !== undefined || opts.identityLabel !== undefined;

  return {
    agreement: opts.agreement,
    digitPsychology:
      opts.psychologyScore == null
        ? undefined
        : { score: opts.psychologyScore, verdict: "SUPPORT" },
    dangerComposition:
      opts.dangerTotal == null
        ? undefined
        : { total: opts.dangerTotal, level: "LOW", isHardBlocked: Boolean(opts.dangerHardBlocked) },
    dossier: !needsDossier
      ? undefined
      : (() => {
          // A real 90-cell dossier always carries its verified permanent
          // identity (identical cellId / marketId / proposition), which is
          // what makes the identity dimension measurable.
          const cellId = opts.identityLabel !== undefined ? "over2" : undefined;
          const proposition: AnyCandidate = { id: "over2", label: "Over 2" };
          const marketId = "R_10";
          return {
            cellId,
            marketId,
            proposition,
            identity:
              opts.identityLabel === undefined
                ? undefined
                : { cellId, marketId, proposition, side: "OVER", barrier: 2 },
            pressure: {
              raw: {
                winPressure: opts.winPressure ?? null,
                losePressure: opts.losePressure ?? null,
              },
            },
            identityConformance:
              opts.identityLabel == null
                ? null
                : identityConformance(opts.identityLabel, opts.identityHardBlocked),
          };
        })(),
  };
}

describe("computeConfluenceCore", () => {
  it("TEST 1 — maximum confluence: FULL identity + strong psychology + full pressure alignment + engine SUPPORT + low danger", () => {
    const c = candidate({
      psychologyScore: 80,
      winPressure: pressureReading({ ratePp: 3, persistence: 1, monotonicUp: true, agreement: "4/4", direction: "STRONGLY_INCREASING", movement: "TAKING OVER" }),
      losePressure: pressureReading({ ratePp: -3, persistence: 1, monotonicDown: true, direction: "STRONGLY_DECREASING", movement: "LOSING GROUND" }),
      agreement: "SUPPORT",
      dangerTotal: 8,
      identityLabel: "FULL",
    });

    const conf = computeConfluenceCore(c);
    expect(conf.measurable).toBe(true);
    expect(["HIGH", "MAXIMUM"]).toContain(conf.level);
  });

  it("TEST 0 — identity materially participates: FULL identity beats WEAK identity, all else equal", () => {
    const base = {
      psychologyScore: 70,
      agreement: "NEUTRAL" as const,
      dangerTotal: 20,
    };
    const full = candidate({ ...base, identityLabel: "FULL" });
    const weak = candidate({ ...base, identityLabel: "WEAK" });

    const confFull = computeConfluenceCore(full);
    const confWeak = computeConfluenceCore(weak);
    expect(confFull.identity.measurable).toBe(true);
    expect(confFull.score).toBeGreaterThan(confWeak.score);
  });

  it("TEST 0b — a hard-blocked identity earns zero identity credit regardless of its label", () => {
    const blocked = candidate({ psychologyScore: 70, identityLabel: "FULL", identityHardBlocked: true });
    const conf = computeConfluenceCore(blocked);
    expect(conf.identity.raw).toBe(0);
  });

  it("TEST 0c — no identity evidence is not measurable and never fabricates a score", () => {
    const c = candidate({ psychologyScore: 70 });
    const conf = computeConfluenceCore(c);
    expect(conf.identity.measurable).toBe(false);
    expect(conf.identity.raw).toBe(0);
  });

  it("TEST 2 — graded psychology: 64/68/72/76 are progressively stronger, never identical", () => {
    const bands = [64, 68, 72, 76];
    const scores = bands.map(
      (s) => computeConfluenceCore(candidate({ psychologyScore: s })).psychology.raw,
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
    expect(new Set(scores).size).toBe(scores.length);
  });

  it("TEST 3 — 63% vs 65%: neither auto-rejected, 65% strictly stronger", () => {
    const below = computeConfluenceCore(candidate({ psychologyScore: 63 }));
    const above = computeConfluenceCore(candidate({ psychologyScore: 65 }));
    expect(below.psychology.measurable).toBe(true);
    expect(above.psychology.measurable).toBe(true);
    expect(above.psychology.raw).toBeGreaterThan(below.psychology.raw);
    expect(below.psychology.raw).toBeLessThan(CONFLUENCE_PSYCHOLOGY_THRESHOLD / 3.2); // stays in the low band
  });

  it("TEST 4 — winning digits increasing beats winning digits flat/weakening, all else equal", () => {
    const flatLose = pressureReading();
    const increasing = computeConfluenceCore(
      candidate({ winPressure: pressureReading({ ratePp: 2.5, persistence: 0.9, monotonicUp: true }), losePressure: flatLose }),
    );
    const flat = computeConfluenceCore(
      candidate({ winPressure: pressureReading({ ratePp: -0.5, persistence: 0.2 }), losePressure: flatLose }),
    );
    expect(increasing.pressure.raw).toBeGreaterThan(flat.pressure.raw);
  });

  it("TEST 5 — losing digits decreasing beats losing digits increasing, all else equal", () => {
    const flatWin = pressureReading();
    const decreasing = computeConfluenceCore(
      candidate({ winPressure: flatWin, losePressure: pressureReading({ ratePp: -2.5, persistence: 0.9, monotonicDown: true }) }),
    );
    const increasing = computeConfluenceCore(
      candidate({ winPressure: flatWin, losePressure: pressureReading({ ratePp: 2.5, persistence: 0.9 }) }),
    );
    expect(decreasing.pressure.raw).toBeGreaterThan(increasing.pressure.raw);
  });

  it("TEST 6 — complete pressure alignment > partial alignment > opposing alignment", () => {
    const complete = computeConfluenceCore(
      candidate({
        winPressure: pressureReading({ ratePp: 2, persistence: 1, monotonicUp: true, agreement: "4/4" }),
        losePressure: pressureReading({ ratePp: -2, persistence: 1, monotonicDown: true }),
      }),
    ).pressure.raw;
    const partial = computeConfluenceCore(
      candidate({
        winPressure: pressureReading({ ratePp: 2, persistence: 0.66, agreement: "3/4" }),
        losePressure: pressureReading({ ratePp: 0, persistence: 0.3 }),
      }),
    ).pressure.raw;
    const opposing = computeConfluenceCore(
      candidate({
        winPressure: pressureReading({ ratePp: 2, persistence: 0.66, agreement: "2/4" }),
        losePressure: pressureReading({ ratePp: 2, persistence: 0.66 }),
      }),
    ).pressure.raw;

    expect(complete).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(opposing);
  });

  it("TEST 7 — engine agreement: SUPPORT > NEUTRAL > CONFLICT", () => {
    const support = computeConfluenceCore(candidate({ agreement: "SUPPORT" })).engineAgreement.raw;
    const neutral = computeConfluenceCore(candidate({ agreement: "NEUTRAL" })).engineAgreement.raw;
    const conflict = computeConfluenceCore(candidate({ agreement: "CONFLICT" })).engineAgreement.raw;
    const strongConflict = computeConfluenceCore(candidate({ agreement: "STRONG CONFLICT" })).engineAgreement.raw;

    expect(support).toBeGreaterThan(neutral);
    expect(neutral).toBeGreaterThan(conflict);
    expect(conflict).toBeGreaterThan(strongConflict);
  });

  it("TEST 8 — danger: LOW > MODERATE > HIGH", () => {
    const low = computeConfluenceCore(candidate({ dangerTotal: 10 })).danger.raw;
    const moderate = computeConfluenceCore(candidate({ dangerTotal: 40 })).danger.raw;
    const high = computeConfluenceCore(candidate({ dangerTotal: 75 })).danger.raw;

    expect(low).toBeGreaterThan(moderate);
    expect(moderate).toBeGreaterThan(high);
  });

  it("a hard-blocked danger composition earns zero danger-safety credit regardless of the raw total", () => {
    const blocked = computeConfluenceCore(candidate({ dangerTotal: 10, dangerHardBlocked: true })).danger.raw;
    expect(blocked).toBe(0);
  });

  it("TEST 18 — determinism: identical evidence always produces identical scores", () => {
    const c = candidate({
      psychologyScore: 71,
      winPressure: pressureReading({ ratePp: 1.4, persistence: 0.7, monotonicUp: true, agreement: "3/4" }),
      losePressure: pressureReading({ ratePp: -0.9, persistence: 0.6 }),
      agreement: "SUPPORT",
      dangerTotal: 22,
    });
    const first = computeConfluenceCore(c);
    const second = computeConfluenceCore({ ...c });
    expect(second.score).toBe(first.score);
    expect(second.level).toBe(first.level);
  });

  it("is not measurable and never fabricates evidence when the candidate carries none", () => {
    const conf = computeConfluenceCore({});
    expect(conf.measurable).toBe(false);
    expect(conf.score).toBe(0);
    expect(conf.level).toBe("NONE");
  });

  it("never lets a candidate below the 64% threshold reach the upper half of the psychology sub-score", () => {
    for (const s of [0, 20, 40, 63.9]) {
      const conf = computeConfluenceCore(candidate({ psychologyScore: s }));
      expect(conf.psychology.raw).toBeLessThan(25);
    }
  });

  // ── REGRESSION: MISSING EVIDENCE IS UNKNOWN, NEVER NEGATIVE ─────────────
  //
  // The score is a weighted mean over the dimensions that actually carry
  // evidence. An ABSENT dimension must neither add nor subtract; charging its
  // full weight as zero would fabricate negative evidence (e.g. reading an
  // absent identity record as though conformance had FAILED).
  it("REGRESSION — an absent dimension is neither credited nor penalised", () => {
    const maxNoIdentity = candidate({
      psychologyScore: 82,
      winPressure: pressureReading({ ratePp: 3, persistence: 1, monotonicUp: true, agreement: "4/4" }),
      losePressure: pressureReading({ ratePp: -3, persistence: 1, monotonicDown: true }),
      agreement: "SUPPORT",
      dangerTotal: 8,
    });
    const conf = computeConfluenceCore(maxNoIdentity);
    expect(conf.identity.measurable).toBe(false);
    expect(conf.identity.contribution).toBe(0);
    // Maximum convergence on every dimension that IS measurable must still be
    // able to reach HIGH/MAXIMUM; it must not be capped by the missing weight.
    expect(["HIGH", "MAXIMUM"]).toContain(conf.level);
  });

  it("REGRESSION — an absent identity does not score the same as a FAILED identity", () => {
    const base = {
      psychologyScore: 82,
      winPressure: pressureReading({ ratePp: 3, persistence: 1, monotonicUp: true, agreement: "4/4" }),
      losePressure: pressureReading({ ratePp: -3, persistence: 1, monotonicDown: true }),
      agreement: "SUPPORT" as const,
      dangerTotal: 8,
    };
    const absent = computeConfluenceCore(candidate({ ...base }));
    const failed = computeConfluenceCore(candidate({ ...base, identityLabel: "FAILED" }));
    const full = computeConfluenceCore(candidate({ ...base, identityLabel: "FULL" }));

    expect(failed.score).toBeLessThan(absent.score);
    expect(full.score).toBeGreaterThan(failed.score);
  });

  it("REGRESSION — identity carries the largest single weight in the one score", () => {
    const base = {
      psychologyScore: 70,
      winPressure: pressureReading(),
      losePressure: pressureReading(),
      agreement: "NEUTRAL" as const,
      dangerTotal: 20,
    };
    const full = computeConfluenceCore(candidate({ ...base, identityLabel: "FULL" }));
    expect(full.identity.weight).toBe(0.25);
    for (const dim of [full.psychology, full.pressure, full.engineAgreement, full.danger]) {
      expect(dim.weight).toBeLessThanOrEqual(full.identity.weight);
    }
    // All five dimensions remain part of the SAME score.
    expect(full.psychology.measurable).toBe(true);
    expect(full.pressure.measurable).toBe(true);
    expect(full.engineAgreement.measurable).toBe(true);
    expect(full.danger.measurable).toBe(true);
  });
});

