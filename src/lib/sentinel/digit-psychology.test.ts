import { describe, expect, it } from "vitest";
import {
  canonicalDigitState,
  contractPsychology,
  entryDigitPsychologyBias,
  type CanonicalDigitState,
} from "./digit-psychology";

function biased(n: number, heavy: number, light: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = i % 20;
    if (r < 6) out.push(heavy);
    else if (r === 6) out.push(light === heavy ? (light + 1) % 10 : light);
    else out.push((i * 7 + 3) % 10);
  }
  return out;
}

describe("canonicalDigitState", () => {
  it("reports INSUFFICIENT with a thin buffer", () => {
    const s = canonicalDigitState([1, 2, 3]);
    expect(s.change).toBe("INSUFFICIENT");
    expect(s.green).toBeNull();
  });

  it("assigns green/red from measured frequency with no vetoed digits", () => {
    const s = canonicalDigitState(biased(1000, 3, 8));
    expect(s.n).toBe(1000);
    expect(s.green).toBe(3); // digit 3 is never excluded from a role
    expect(s.secondGreen).not.toBe(s.green);
    expect(s.red).not.toBeNull();
    expect(s.pct.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });
});

describe("contractPsychology", () => {
  const state = canonicalDigitState(biased(1000, 3, 8));
  const over4 = contractPsychology(state, {
    label: "OVER 4",
    side: "OVER",
    barrier: 4,
    winners: [5, 6, 7, 8, 9],
  });

  it("derives zones from the contract's own winners", () => {
    expect(over4.winningZone).toEqual([5, 6, 7, 8, 9]);
    expect(over4.losingZone).toEqual([0, 1, 2, 3, 4]);
    expect(over4.positions.length).toBeGreaterThan(0);
  });

  it("keeps the ranking contribution bounded", () => {
    expect(Math.abs(over4.rankingDelta)).toBeLessThanOrEqual(4);
    expect(["SUPPORT", "NEUTRAL", "CONFLICT"]).toContain(over4.verdict);
  });

  it("applies structural penalty and caution when RED sits on the losing side", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [12, 10, 8, 5, 10, 15, 10, 10, 10, 10],
      deltaPp: [-0.5, 0, 0, 1.5, 0, 0, 0, 0, 0, 0], // digit 3 is +1.5pp (strengthening)
      recentPct: [120, 100, 80, 50, 100, 150, 100, 100, 100, 100],
      green: 6, // EVEN for OVER
      secondGreen: 8,
      red: 3, // digit 3 is RED, ODD, sits in losing zone [0, 1, 2, 3, 4]
      secondRed: 7, // in winning zone, off digit 1
      mostIncreasing: 3,
      mostDecreasing: 4,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "OVER 4",
      side: "OVER",
      barrier: 4,
      winners: [5, 6, 7, 8, 9],
    });

    expect(res.hardBlock).toBe(false);
    expect(
      res.cautions.some(
        (c) => c.includes("RED") || c.includes("outside 5-9") || c.includes("losing"),
      ),
    ).toBe(true);
    expect(res.verdict).toBe("CONFLICT");
  });

  it("applies structural penalty when GREEN is on the losing side with decay", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [12, 10, 20, 10, 10, 10, 10, 10, 8, 0],
      deltaPp: [-0.5, 0, -1.0, 0, 0, 0, 0, 0, 0, 0], // green 2 is decaying (-1.0pp), no digit is increasing
      recentPct: [120, 100, 200, 100, 100, 100, 100, 100, 80, 0],
      green: 2, // green sits in losing zone [0, 1, 2, 3, 4] and is EVEN
      secondGreen: 6, // kept in the winning zone so this test isolates the GREEN carve-out
      red: 9,
      secondRed: 7,
      mostIncreasing: null, // no winning-side replacement
      mostDecreasing: 2,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "OVER 4",
      side: "OVER",
      barrier: 4,
      winners: [5, 6, 7, 8, 9],
    });

    expect(res.hardBlock).toBe(false);
    expect(res.score).toBeLessThan(75);
  });

  it("passes without hardBlock when GREEN on the losing side is decaying with a confirmed winning-side replacement", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [12, 10, 20, 10, 10, 10, 10, 10, 8, 0],
      deltaPp: [-0.5, 0, -1.0, 0, 0, 0, 0, 1.2, 0, 0], // green 2 is decaying (-1.0pp), mostIncreasing is 7 (in winning zone!)
      recentPct: [120, 100, 200, 100, 100, 100, 100, 100, 80, 0],
      green: 2, // green in losing zone [0, 1, 2, 3, 4] and is EVEN
      secondGreen: 6, // kept in the winning zone so this test isolates the GREEN carve-out
      red: 9,
      secondRed: 7,
      mostIncreasing: 7, // 7 is in winning zone [5, 6, 7, 8, 9] -> confirmed replacement
      mostDecreasing: 2,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "OVER 4",
      side: "OVER",
      barrier: 4,
      winners: [5, 6, 7, 8, 9],
    });

    expect(res.hardBlock).toBe(false);
    expect(res.hardBlockReason).toBeNull();
  });

  it("hard-blocks when 2ND RED sits on the losing side, regardless of PressureField state", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [12, 10, 10, 10, 10, 15, 10, 10, 10, 3],
      deltaPp: [-0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      recentPct: [120, 100, 100, 100, 100, 150, 100, 100, 100, 30],
      green: 6, // EVEN
      secondGreen: 8,
      red: 9,
      secondRed: 3, // 2nd RED is 3 (losing zone, off the excluded digit 1)
      mostIncreasing: null,
      mostDecreasing: null,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const mockPressure: any = {
      digits: Array.from({ length: 10 }, (_, d) => ({
        d,
        share: 0.1,
        momentum: 0,
        accel: 0,
        state: "fair",
        score: 0,
        detail: "",
      })),
      window: 1000,
      sub: 150,
      distortion: 0.02,
      flow: 0.05,
    };

    const res = contractPsychology(
      mockState,
      {
        label: "OVER 4",
        side: "OVER",
        barrier: 4,
        winners: [5, 6, 7, 8, 9],
      },
      mockPressure,
    );

    expect(res.hardBlock).toBe(false);
    expect(res.cautions.some((c) => c.includes("2ND RED"))).toBe(true);
  });

  it("applies penalty and caution for RED on losing side even when FADING", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [12, 10, 5, 10, 10, 15, 10, 10, 10, 8],
      deltaPp: [-0.5, 0, -0.8, 0, 0, 0, 0, 0, 0, 0], // digit 2 is FADING, not strengthening
      recentPct: [120, 100, 42, 100, 100, 150, 100, 100, 100, 80],
      green: 6, // EVEN
      secondGreen: 8,
      red: 2, // digit 2 is RED, sits in losing zone [0, 1, 2, 3, 4]
      secondRed: 3,
      mostIncreasing: null,
      mostDecreasing: 2,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "OVER 4",
      side: "OVER",
      barrier: 4,
      winners: [5, 6, 7, 8, 9],
    });

    expect(res.hardBlock).toBe(false);
    expect(res.cautions.some((c) => c.includes("RED") || c.includes("outside 5-9"))).toBe(true);
  });

  it("hard-blocks RED when it sits on the excluded digit for the side (1 for OVER)", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [12, 5, 10, 10, 10, 15, 10, 10, 10, 18],
      deltaPp: [-0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      recentPct: [120, 50, 100, 100, 100, 150, 100, 100, 100, 180],
      green: 6,
      secondGreen: 8,
      red: 1, // excluded digit for OVER
      secondRed: 3,
      mostIncreasing: null,
      mostDecreasing: null,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "OVER 4",
      side: "OVER",
      barrier: 4,
      winners: [5, 6, 7, 8, 9],
    });

    expect(res.hardBlock).toBe(true);
    expect(res.hardBlockReason).toContain("forbidden digit");
  });

  it("flags a zone contest when GREEN and 2ND GREEN are tied across opposite zones", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [11.0, 10, 10, 10, 10, 10, 11.4, 10, 10, 7.6], // green=6 (winning, 11.4%), 2nd green=0 (losing, 11.0%), gap 0.4pp
      deltaPp: [-0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      recentPct: [110, 100, 100, 100, 100, 100, 114, 100, 100, 76],
      green: 6,
      secondGreen: 0,
      red: 9,
      secondRed: 7,
      mostIncreasing: null,
      mostDecreasing: null,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "OVER 4",
      side: "OVER",
      barrier: 4,
      winners: [5, 6, 7, 8, 9],
    });

    expect(res.zoneContested).toBe(true);
    expect(res.zoneContestedReason).toContain("GREEN bar contested");
  });

  it("penalizes OVER contract when RED is outside 5-9 range", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [12, 10, 10, 5, 10, 15, 10, 10, 10, 8],
      deltaPp: [-0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      recentPct: [120, 100, 100, 50, 100, 150, 100, 100, 100, 80],
      green: 6,
      secondGreen: 8,
      red: 3, // 3 is < 5 (outside 5-9)
      secondRed: 7,
      mostIncreasing: null,
      mostDecreasing: null,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "OVER 4",
      side: "OVER",
      barrier: 4,
      winners: [5, 6, 7, 8, 9],
    });

    expect(res.hardBlock).toBe(false);
    expect(res.cautions.some((c) => c.includes("RED") && c.includes("outside 5-9"))).toBe(true);
  });

  it("penalizes UNDER contract when RED is outside 0-4 range", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [10, 10, 10, 10, 10, 15, 6, 10, 10, 19],
      deltaPp: [0, 0, 0, 0, 0, 0, 0, 0, 0, -0.5],
      recentPct: [100, 100, 100, 100, 100, 150, 60, 100, 100, 190],
      green: 9, // ODD for UNDER
      secondGreen: 7,
      red: 6, // 6 is > 4 (outside 0-4)
      secondRed: 2,
      mostIncreasing: null,
      mostDecreasing: null,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "UNDER 5",
      side: "UNDER",
      barrier: 5,
      winners: [0, 1, 2, 3, 4],
    });

    expect(res.hardBlock).toBe(false);
    expect(res.cautions.some((c) => c.includes("RED") && c.includes("outside 0-4"))).toBe(true);
  });

  it("validates OVER edge group 7/8/9 under 10% and increasing rapidly via pressure engine", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [11.0, 10, 10, 10, 10, 15, 12, 7.5, 8.0, 6.5],
      deltaPp: [-0.8, 0, 0, 0, 0, 0, 0, 0.6, 0.7, 0.5], // 7,8,9 delta > 0 and share < 10%
      recentPct: [102, 100, 100, 100, 100, 150, 120, 81, 87, 70],
      green: 0, // extreme 0 with decay
      secondGreen: 6,
      red: 9, // in 5-9, ODD, winning zone
      secondRed: 7, // in 5-9, ODD, winning zone
      mostIncreasing: 8,
      mostDecreasing: 0,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const mockPressure: any = {
      digits: [
        {
          d: 0,
          share: 0.11,
          momentum: -0.01,
          accel: -0.005,
          state: "exhausted",
          score: -5,
          detail: "",
        },
        { d: 1, share: 0.1, momentum: 0, accel: 0, state: "fair", score: 0, detail: "" },
        { d: 2, share: 0.1, momentum: 0, accel: 0, state: "fair", score: 0, detail: "" },
        { d: 3, share: 0.1, momentum: 0, accel: 0, state: "fair", score: 0, detail: "" },
        { d: 4, share: 0.1, momentum: 0, accel: 0, state: "fair", score: 0, detail: "" },
        {
          d: 5,
          share: 0.15,
          momentum: 0.005,
          accel: 0.001,
          state: "dominant",
          score: 5,
          detail: "",
        },
        {
          d: 6,
          share: 0.12,
          momentum: 0.002,
          accel: 0.001,
          state: "recovering",
          score: 3,
          detail: "",
        },
        {
          d: 7,
          share: 0.075,
          momentum: 0.006,
          accel: 0.002,
          state: "dominant",
          score: 4,
          detail: "",
        },
        {
          d: 8,
          share: 0.08,
          momentum: 0.007,
          accel: 0.003,
          state: "recovering",
          score: 4,
          detail: "",
        },
        {
          d: 9,
          share: 0.065,
          momentum: 0.005,
          accel: 0.002,
          state: "dominant",
          score: 3,
          detail: "",
        },
      ],
      window: 1000,
      sub: 150,
      distortion: 0.02,
      flow: 0.05,
    };

    const res = contractPsychology(
      mockState,
      {
        label: "OVER 4",
        side: "OVER",
        barrier: 4,
        winners: [5, 6, 7, 8, 9],
      },
      mockPressure,
    );

    expect(res.hardBlock).toBe(false);
    const edgePos = res.positions.find((p) => p.role === "EDGE GROUP");
    expect(edgePos).toBeDefined();
    expect(edgePos?.support).toBe(1);
    expect(res.verdict).toBe("SUPPORT");
  });
});

describe("entryDigitPsychologyBias", () => {
  const state = canonicalDigitState(biased(1000, 3, 8));
  const under5 = contractPsychology(state, {
    label: "UNDER 5",
    side: "UNDER",
    barrier: 5,
    winners: [0, 1, 2, 3, 4],
  });

  it("stays inside ±3 for every digit", () => {
    for (let d = 0; d < 10; d++) {
      expect(Math.abs(entryDigitPsychologyBias(state, under5, d).points)).toBeLessThanOrEqual(3);
    }
  });

  it("has no influence when the canonical window is immature", () => {
    const thin = canonicalDigitState([1, 2, 3, 4]);
    expect(entryDigitPsychologyBias(thin, under5, 3).points).toBe(0);
  });
});

describe("Regression Suite (§35 Digit Psychology Logic Correction)", () => {
  // Test 1: UNDER 8 + decreasing digit 1 — asserted no hard veto, treated as contextual evidence
  it("REGRESSION TEST 1: UNDER 8 + mostDecreasing = 1 is NOT disqualified or vetoed", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [12, 8, 10, 16, 12, 14, 10, 10, 4, 4],
      deltaPp: [0.5, -1.2, 0.4, 1.8, 0.2, 0.1, -0.2, -0.1, -0.5, -1.0], // digit 1 is -1.2pp
      recentPct: [120, 80, 100, 160, 120, 140, 100, 100, 40, 40],
      green: 3, // ODD (3), in winning zone [0..7]
      secondGreen: 5, // ODD (5), in winning zone [0..7]
      red: 0, // EVEN (0), in range 0-4, in winning zone [0..7]
      secondRed: 2, // EVEN (2), in range 0-4, in winning zone [0..7]
      mostIncreasing: 3,
      mostDecreasing: 1, // digit 1 (winning zone for UNDER 8, NOT in [8,9])
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "UNDER 8",
      side: "UNDER",
      barrier: 8,
      winners: [0, 1, 2, 3, 4, 5, 6, 7],
    });

    expect(res.hardBlock).toBe(false);
    expect(res.verdict).toBe("SUPPORT");
    const decPos = res.positions.find((p) => p.role === "MOST DECREASING");
    expect(decPos).toBeDefined();
    // Contextual evidence, never opposing
    expect(decPos?.support).toBeGreaterThanOrEqual(0);
  });

  // Test 2: UNDER 8 + decreasing digit 8 — losing side decrease is supportive
  it("REGRESSION TEST 2: UNDER 8 + decreasing digit 8 is recognized as supportive", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [12, 8, 10, 16, 12, 14, 10, 10, 4, 4],
      deltaPp: [0.5, 0.2, 0.4, 1.8, 0.2, 0.1, -0.2, -0.1, -1.5, -0.5], // digit 8 is -1.5pp
      recentPct: [120, 80, 100, 160, 120, 140, 100, 100, 40, 40],
      green: 3,
      secondGreen: 5,
      red: 0,
      secondRed: 2,
      mostIncreasing: 3,
      mostDecreasing: 8, // in losing zone [8,9]
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "UNDER 8",
      side: "UNDER",
      barrier: 8,
      winners: [0, 1, 2, 3, 4, 5, 6, 7],
    });

    expect(res.hardBlock).toBe(false);
    expect(res.verdict).toBe("SUPPORT");
    const decPos = res.positions.find((p) => p.role === "MOST DECREASING");
    expect(decPos?.support).toBe(1);
  });

  // Test 3: OVER equivalent — decreasing digit on winning side is NOT a hard veto
  it("REGRESSION TEST 3: OVER contract + decreasing digit on winning side does not veto", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [4, 4, 10, 10, 12, 14, 16, 10, 12, 8],
      deltaPp: [-1.0, -0.5, -0.2, -0.1, 0.2, 0.1, 1.5, -1.2, 0.4, 0.8], // digit 7 is -1.2pp
      recentPct: [40, 40, 100, 100, 120, 140, 160, 100, 120, 80],
      green: 6, // EVEN (6), in winning zone [5..9]
      secondGreen: 8, // EVEN (8), in winning zone [5..9]
      red: 5, // ODD (5), in range 5-9, in winning zone [5..9]
      secondRed: 7, // ODD (7), in range 5-9, in winning zone [5..9]
      mostIncreasing: 6,
      mostDecreasing: 7, // in winning zone for OVER 3 [4..9]
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "OVER 3",
      side: "OVER",
      barrier: 3,
      winners: [4, 5, 6, 7, 8, 9],
    });

    expect(res.hardBlock).toBe(false);
    expect(res.verdict).toBe("SUPPORT");
    const decPos = res.positions.find((p) => p.role === "MOST DECREASING");
    expect(decPos?.support).toBe(0); // Neutral contextual evidence, not -1
  });

  // Test 4: Red-bar evidence — strong red-bar support keeps contract valid even if most-decreasing is on winning side
  it("REGRESSION TEST 4: strong red-bar support keeps contract valid when decreasing digit is on winning side", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [5, 10, 6, 18, 12, 16, 8, 10, 9, 6],
      deltaPp: [0.3, -0.8, 0.2, 1.6, 0.4, 0.2, -0.3, -0.1, -0.2, -1.3],
      recentPct: [50, 100, 60, 180, 120, 160, 80, 100, 90, 60],
      green: 3, // ODD (3)
      secondGreen: 5, // ODD (5)
      red: 0, // EVEN (0), correctly in 0-4 and winning zone
      secondRed: 2, // EVEN (2), correctly in 0-4 and winning zone
      mostIncreasing: 3,
      mostDecreasing: 1, // on winning side
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "UNDER 7",
      side: "UNDER",
      barrier: 7,
      winners: [0, 1, 2, 3, 4, 5, 6],
    });

    expect(res.hardBlock).toBe(false);
    expect(res.verdict).toBe("SUPPORT");
    const redPos = res.positions.find((p) => p.role === "RED");
    expect(redPos?.support).toBe(1);
  });

  // Test 5: Red-bar conflict — red-bar conflict opposes contract even if most-decreasing is in favorable losing position
  it("REGRESSION TEST 5: red-bar conflict opposes contract even if decreasing digit is in losing zone", () => {
    const mockState: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [12, 10, 8, 5, 10, 15, 10, 10, 10, 10],
      deltaPp: [-0.5, 0, 0, 1.5, 0, 0, 0, 0, 0, -2.0], // digit 9 is most decreasing (-2.0pp)
      recentPct: [120, 100, 80, 50, 100, 150, 100, 100, 100, 100],
      green: 6,
      secondGreen: 8,
      red: 3, // RED is 3 (outside 5-9 for OVER, sitting in losing zone 0-4)
      secondRed: 7,
      mostIncreasing: 3,
      mostDecreasing: 9, // in winning zone for OVER 4, but fading
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const res = contractPsychology(mockState, {
      label: "OVER 4",
      side: "OVER",
      barrier: 4,
      winners: [5, 6, 7, 8, 9],
    });

    expect(res.hardBlock).toBe(false);
    // Red bar conflict takes precedence over most-decreasing position
    expect(res.verdict).toBe("CONFLICT");
  });

  // Test 6: Special digits — 1, 8, 012, 789
  it("REGRESSION TEST 6: special handling for 1, 8, 012, 789 remains active and distinct from generic zone logic", () => {
    // Digit 1 forbidden as RED for OVER
    const forbidden1State: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [10, 3, 10, 10, 10, 15, 12, 10, 10, 10],
      deltaPp: [0, 0, 0, 0, 0, 0.5, 0.5, 0, 0, 0],
      recentPct: [100, 30, 100, 100, 100, 150, 120, 100, 100, 100],
      green: 6,
      secondGreen: 8,
      red: 1, // Forbidden excluded digit 1 for OVER
      secondRed: 7,
      mostIncreasing: 6,
      mostDecreasing: null,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const overRes = contractPsychology(forbidden1State, {
      label: "OVER 4",
      side: "OVER",
      barrier: 4,
      winners: [5, 6, 7, 8, 9],
    });
    expect(overRes.hardBlock).toBe(true);
    expect(overRes.hardBlockReason).toContain("forbidden digit 1");

    // Digit 8 forbidden as RED for UNDER
    const forbidden8State: CanonicalDigitState = {
      n: 1000,
      windowSize: 1000,
      pct: [10, 10, 10, 12, 10, 10, 10, 10, 3, 15],
      deltaPp: [0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0.5],
      recentPct: [100, 100, 100, 120, 100, 100, 100, 100, 30, 150],
      green: 9,
      secondGreen: 3,
      red: 8, // Forbidden excluded digit 8 for UNDER
      secondRed: 2,
      mostIncreasing: 9,
      mostDecreasing: null,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "test",
    };

    const underRes = contractPsychology(forbidden8State, {
      label: "UNDER 7",
      side: "UNDER",
      barrier: 7,
      winners: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(underRes.hardBlock).toBe(true);
    expect(underRes.hardBlockReason).toContain("forbidden digit 8");
  });
});
