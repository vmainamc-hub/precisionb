import { describe, expect, it } from "vitest";
import { evaluateExecutionReady, type ExecutionReadyInput } from "./execution-ready";

describe("evaluateExecutionReady (§35)", () => {
  const baseReadyInput: ExecutionReadyInput = {
    side: "OVER",
    winners: [3, 4, 5, 6, 7, 8, 9],
    losers: [0, 1, 2],
    structureDirection: "OVER",
    direction: {
      label: "STRONG",
      score: 85,
      spine: {
        structuralDirection: "OVER",
        aligned: true,
      },
    },
    danger: {
      level: "CALM",
      total: 12,
      isHardBlocked: false,
      summary: "Calm market conditions",
    },
    canonicalState: {
      mostIncreasing: 7, // in winners [3..9]
      mostDecreasing: 1, // in losers [0..2]
    },
    entryPoint: {
      status: "ENTER NOW",
      confidence: 78,
    },
    entryClearance: {
      verdict: "CLEARED",
      requirements: [
        { met: true, label: "Setup quality prime" },
        { met: true, label: "Danger low" },
      ],
    },
  };

  it("passes when all 4 conditions hold simultaneously", () => {
    const res = evaluateExecutionReady(baseReadyInput);
    expect(res.executionReady).toBe(true);
    expect(res.executionReadyReasons).toHaveLength(0);
    expect(res.conditions.structuralDirectionSettled).toBe(true);
    expect(res.conditions.dangerLow).toBe(true);
    expect(res.conditions.digitTrendConfirmed).toBe(true);
    expect(res.conditions.entryArmed).toBe(true);
  });

  it("fails Condition 1 when structural direction opposes contract", () => {
    const input: ExecutionReadyInput = {
      ...baseReadyInput,
      structureDirection: "UNDER", // conflict with OVER
      direction: {
        label: "AGAINST",
        score: 0,
        spine: {
          structuralDirection: "UNDER",
          aligned: false,
        },
      },
    };
    const res = evaluateExecutionReady(input);
    expect(res.executionReady).toBe(false);
    expect(res.conditions.structuralDirectionSettled).toBe(false);
    expect(res.conditions.dangerLow).toBe(true);
    expect(res.conditions.digitTrendConfirmed).toBe(true);
    expect(res.conditions.entryArmed).toBe(true);
    expect(
      res.executionReadyReasons.some((r) => r.includes("conflicts with structural direction")),
    ).toBe(true);
  });

  it("fails Condition 2 when danger is elevated or hard-blocked", () => {
    const input: ExecutionReadyInput = {
      ...baseReadyInput,
      danger: {
        level: "HIGH",
        total: 68,
        isHardBlocked: true,
        summary: "Hostile danger profile",
      },
    };
    const res = evaluateExecutionReady(input);
    expect(res.executionReady).toBe(false);
    expect(res.conditions.structuralDirectionSettled).toBe(true);
    expect(res.conditions.dangerLow).toBe(false);
    expect(res.conditions.digitTrendConfirmed).toBe(true);
    expect(res.conditions.entryArmed).toBe(true);
    expect(res.executionReadyReasons.some((r) => r.includes("Danger hard-blocked"))).toBe(true);
  });

  it("fails Condition 3 when most increasing is not in winning zone", () => {
    const input: ExecutionReadyInput = {
      ...baseReadyInput,
      canonicalState: {
        mostIncreasing: 1, // in losers [0..2] instead of winners [3..9]
        mostDecreasing: 0,
      },
    };
    const res = evaluateExecutionReady(input);
    expect(res.executionReady).toBe(false);
    expect(res.conditions.structuralDirectionSettled).toBe(true);
    expect(res.conditions.dangerLow).toBe(true);
    expect(res.conditions.digitTrendConfirmed).toBe(false);
    expect(res.conditions.entryArmed).toBe(true);
    expect(
      res.executionReadyReasons.some((r) =>
        r.includes("most increasing digit (1) is not in winning zone"),
      ),
    ).toBe(true);
  });

  it("fails Condition 4 when entry is unvalidated / not armed", () => {
    const input: ExecutionReadyInput = {
      ...baseReadyInput,
      entryPoint: {
        status: "UNVALIDATED",
        confidence: 40,
      },
    };
    const res = evaluateExecutionReady(input);
    expect(res.executionReady).toBe(false);
    expect(res.conditions.structuralDirectionSettled).toBe(true);
    expect(res.conditions.dangerLow).toBe(true);
    expect(res.conditions.digitTrendConfirmed).toBe(true);
    expect(res.conditions.entryArmed).toBe(false);
    expect(res.executionReadyReasons.some((r) => r.includes("Entry point not armed"))).toBe(true);
  });

  it("fails Condition 4 when entry clearance has unmet requirements", () => {
    const input: ExecutionReadyInput = {
      ...baseReadyInput,
      entryClearance: {
        verdict: "WAIT",
        requirements: [
          { met: true, label: "Setup quality prime" },
          { met: false, label: "Awaiting tick confirmation" },
        ],
      },
    };
    const res = evaluateExecutionReady(input);
    expect(res.executionReady).toBe(false);
    expect(res.conditions.entryArmed).toBe(false);
    expect(res.executionReadyReasons.some((r) => r.includes("Entry clearance not satisfied"))).toBe(
      true,
    );
  });

  // ── REGRESSION SUITE (§35 Digit Psychology Correction) ────────────────
  it("REGRESSION TEST 1: UNDER 8 + decreasing digit 1 has NO hard veto", () => {
    const under8Input: ExecutionReadyInput = {
      side: "UNDER",
      winners: [0, 1, 2, 3, 4, 5, 6, 7],
      losers: [8, 9],
      structureDirection: "UNDER",
      direction: {
        label: "STRONG",
        score: 82,
        spine: {
          structuralDirection: "UNDER",
          aligned: true,
        },
      },
      danger: {
        level: "CALM",
        total: 10,
        isHardBlocked: false,
        summary: "Calm",
      },
      canonicalState: {
        mostIncreasing: 3, // in winners [0..7]
        mostDecreasing: 1, // in winners [0..7], NOT in losers [8,9]
      },
      entryPoint: {
        status: "ARMED",
        confidence: 75,
      },
      entryClearance: {
        verdict: "CLEARED",
        requirements: [{ met: true, label: "Cleared" }],
      },
    };

    const res = evaluateExecutionReady(under8Input);
    expect(res.executionReady).toBe(true);
    expect(res.conditions.digitTrendConfirmed).toBe(true);
    expect(res.executionReadyReasons).toHaveLength(0);
    expect(
      res.executionReadyReasons.some((r) => r.includes("most decreasing digit")),
    ).toBe(false);
  });

  it("REGRESSION TEST 2: UNDER 8 + decreasing digit 8 succeeds without imposing a hard requirement", () => {
    const under8Input: ExecutionReadyInput = {
      side: "UNDER",
      winners: [0, 1, 2, 3, 4, 5, 6, 7],
      losers: [8, 9],
      structureDirection: "UNDER",
      direction: {
        label: "STRONG",
        score: 85,
        spine: {
          structuralDirection: "UNDER",
          aligned: true,
        },
      },
      danger: {
        level: "CALM",
        total: 10,
        isHardBlocked: false,
      },
      canonicalState: {
        mostIncreasing: 3,
        mostDecreasing: 8, // in losers [8,9]
      },
      entryPoint: {
        status: "ARMED",
        confidence: 80,
      },
      entryClearance: {
        verdict: "CLEARED",
        requirements: [{ met: true, label: "Cleared" }],
      },
    };

    const res = evaluateExecutionReady(under8Input);
    expect(res.executionReady).toBe(true);
    expect(res.conditions.digitTrendConfirmed).toBe(true);
  });

  it("REGRESSION TEST 3: OVER contract + decreasing digit in winning side does NOT trigger a hard veto", () => {
    const overInput: ExecutionReadyInput = {
      side: "OVER",
      winners: [3, 4, 5, 6, 7, 8, 9],
      losers: [0, 1, 2],
      structureDirection: "OVER",
      direction: {
        label: "STRONG",
        score: 80,
        spine: {
          structuralDirection: "OVER",
          aligned: true,
        },
      },
      danger: {
        level: "LOW",
        total: 20,
        isHardBlocked: false,
      },
      canonicalState: {
        mostIncreasing: 6, // in winners [3..9]
        mostDecreasing: 7, // in winners [3..9], NOT in losers [0..2]
      },
      entryPoint: {
        status: "ENTER NOW",
        confidence: 70,
      },
      entryClearance: {
        verdict: "CLEARED",
        requirements: [{ met: true, label: "Cleared" }],
      },
    };

    const res = evaluateExecutionReady(overInput);
    expect(res.executionReady).toBe(true);
    expect(res.conditions.digitTrendConfirmed).toBe(true);
    expect(res.executionReadyReasons).toHaveLength(0);
  });
});
