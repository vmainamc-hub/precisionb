import { describe, expect, it } from "vitest";
import { evaluateParityPsychology } from "../engine";
import type { MarketIntelligence } from "../../market-intelligence";
import type { DigitIntelligence } from "../../market-intelligence";

function digit(
  d: number,
  share: number,
  velocity: number,
  acceleration = velocity / 2,
  activityTrend: DigitIntelligence["activityTrend"] = velocity > 0.006 ? "RISING" : velocity < -0.006 ? "FALLING" : "STABLE",
): DigitIntelligence {
  return {
    digit: d,
    parity: d % 2 === 0 ? "EVEN" : "ODD",
    shares: { w20: share, w50: share, w100: share, w500: Math.max(0, share - velocity) },
    velocity,
    acceleration,
    activityTrend,
    persistence: Math.min(1, Math.max(0, 0.5 + velocity * 20)),
    suppression: Math.max(0, 0.1 - share) * 8,
    recurrence: 0.5,
    transitionIn: 0.05,
    transitionOut: 0.05,
    hiddenMovement: Math.min(1, Math.abs(velocity) * 8),
  };
}

function intel(digits: DigitIntelligence[]): MarketIntelligence {
  return {
    sampleSize: 500,
    parity: {
      evenShare: digits.filter(d => d.parity === "EVEN").reduce((a, d) => a + d.shares.w100, 0),
      oddShare: digits.filter(d => d.parity === "ODD").reduce((a, d) => a + d.shares.w100, 0),
      shortEvenShare: 0.56,
      mediumEvenShare: 0.55,
      longEvenShare: 0.52,
      direction: "EVEN",
      persistence: 0.7,
      acceleration: 0.01,
    },
    digits,
    structural: {
      red: null, green: null, yellow: null, lightRed: null, purple: null,
      hypothesis: "ACCUMULATION",
      reversalProbability: 0.1,
      rotationRate: 0.1,
      narrative: [],
    },
    bands: [],
    matchDiffer: {
      matchRate: 0.05, differRate: 0.95, matchEvenRate: 0.5, matchOddRate: 0.5,
      differEvenRate: 0.56, differOddRate: 0.44, currentMode: "DIFFER",
    },
    lacunas: [],
    redistribution: {
      highDigitsFalling: 0.1, lowDigitsRising: 0.1, concentrationChange: 0, balancing: false, mechanism: "STABLE",
    },
    engineContext: { supportEven: 0.6, supportOdd: 0.4, oppositionEven: 0.4, oppositionOdd: 0.6, agreement: 0.8 },
    mechanism: "test",
    why: [],
    warnings: [],
    quality: 0.9,
  };
}

describe("Parity Psychology chief analyst", () => {
  it("treats RED1, RED2 and MOST INCREASING as core EVEN alignment while GREEN is only a bonus", () => {
    // Lowest two are even (0,2); highest two are odd to prove green parity
    // is not required for the EVEN thesis. d8 is the strongest riser.
    const ds = [
      digit(0, .06, .010, .008),
      digit(2, .065, .009, .006),
      digit(4, .095, .004, .002),
      digit(6, .10, .003, .001),
      digit(8, .13, .020, .015),
      digit(1, .16, -.004, -.002),
      digit(3, .14, -.006, -.003),
      digit(5, .11, -.004, -.002),
      digit(7, .08, -.003, -.001),
      digit(9, .16, -.005, -.002),
    ];
    const r = evaluateParityPsychology("M", intel(ds), Date.now()).snapshot;
    expect(r.even.roles.red.parity).toBe("EVEN");
    expect(r.even.roles.secondRed.parity).toBe("EVEN");
    expect(r.even.roles.mostIncreasing.parity).toBe("EVEN");
    expect(r.even.reasons.some(x => x.includes("RED #1"))).toBe(true);
  });

  it("requires the ODD mirror: odd reds, odd increasing force and 1/9 activity", () => {
    const ds = [
      digit(0, .16, -.005), digit(2, .14, -.004), digit(4, .11, -.003),
      digit(6, .08, -.003), digit(8, .16, -.004),
      digit(1, .06, .012, .008), digit(3, .065, .009, .006),
      digit(5, .095, .004), digit(7, .10, .003), digit(9, .13, .020, .015),
    ];
    const r = evaluateParityPsychology("M", intel(ds), Date.now()).snapshot;
    expect(r.odd.roles.red.parity).toBe("ODD");
    expect(r.odd.roles.secondRed.parity).toBe("ODD");
    expect(r.odd.roles.mostIncreasing.parity).toBe("ODD");
    expect(r.odd.specialDigitActivity).toBeGreaterThan(0);
  });

  it("does not confuse high parity share with healthy psychology when reversal is rising", () => {
    const ds = [
      digit(0, .16, -.012, -.006), digit(2, .15, -.010, -.005), digit(4, .12, -.008, -.004),
      digit(6, .10, -.006, -.003), digit(8, .13, -.010, -.006),
      digit(1, .05, .020, .012), digit(3, .06, .015, .010), digit(5, .08, .012, .008),
      digit(7, .075, .011, .007), digit(9, .095, .018, .011),
    ];
    const r = evaluateParityPsychology("M", intel(ds), Date.now()).snapshot;
    expect(r.even.reversalLikelihood).toBeGreaterThan(r.even.continuationLikelihood);
    expect(r.even.health === "REVERSING" || r.even.health === "TRANSITIONING" || r.even.health === "EXHAUSTED" || r.even.health === "WEAKENING").toBe(true);
    expect(r.chiefParity).not.toBe("EVEN");
  });
});
