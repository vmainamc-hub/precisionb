import { describe, it, expect } from "vitest";
import { classifyRedSemantics } from "./red-semantics";
import type { CanonicalDigitState, ContractShape } from "./digit-psychology";

const overShape: ContractShape = {
  label: "OVER 3",
  side: "OVER",
  barrier: 3,
  winners: [4, 5, 6, 7, 8, 9],
};

function state(overrides: Partial<CanonicalDigitState> = {}): CanonicalDigitState {
  return {
    n: 1000,
    windowSize: 1000,
    pct: Array(10).fill(10),
    recentPct: Array(10).fill(10),
    deltaPp: Array(10).fill(0),
    green: 7,
    secondGreen: 6,
    red: 5,
    secondRed: 9,
    mostIncreasing: 7,
    mostDecreasing: 2,
    change: "STABLE" as CanonicalDigitState["change"],
    changeDetail: "",
    summary: "",
    ...overrides,
  };
}

describe("RED semantics — mandatory, non-compensable structure", () => {
  it("mandatoryRedStructureFailed is true when RED sits on the losing side", () => {
    const deltaPp = Array(10).fill(0);
    deltaPp[7] = 1.5; // winning side gaining
    const result = classifyRedSemantics(
      state({ red: 2, secondRed: 9, deltaPp }), // digit 2 is a loser for OVER 3
      overShape,
    );
    expect(result.redOnWinningSide).toBe(false);
    expect(result.mandatoryRedStructureFailed).toBe(true);
    expect(result.mandatoryFailureReasons.join(" ")).toContain("RED (digit 2)");
  });

  it("mandatoryRedStructureFailed is true when 2ND RED sits on the losing side", () => {
    const deltaPp = Array(10).fill(0);
    deltaPp[7] = 1.5;
    const result = classifyRedSemantics(state({ red: 5, secondRed: 0, deltaPp }), overShape);
    expect(result.secondRedOnWinningSide).toBe(false);
    expect(result.mandatoryRedStructureFailed).toBe(true);
  });

  it("mandatoryRedStructureFailed is true when winning side is not gaining", () => {
    const deltaPp = Array(10).fill(0);
    deltaPp[7] = -1.2; // net winning-side delta <= 0
    deltaPp[2] = 1.2;
    const result = classifyRedSemantics(state({ red: 5, secondRed: 9, deltaPp }), overShape);
    expect(result.redOnWinningSide).toBe(true);
    expect(result.secondRedOnWinningSide).toBe(true);
    expect(result.winningSideGainingPercentage).toBe(false);
    expect(result.mandatoryRedStructureFailed).toBe(true);
  });

  it("mandatoryRedStructureFailed is false when RED/2ND RED are on the winning side and it is gaining", () => {
    const deltaPp = Array(10).fill(0);
    deltaPp[7] = 0.9;
    deltaPp[5] = 0.4;
    const result = classifyRedSemantics(state({ red: 5, secondRed: 9, deltaPp }), overShape);
    expect(result.redOnWinningSide).toBe(true);
    expect(result.secondRedOnWinningSide).toBe(true);
    expect(result.winningSideGainingPercentage).toBe(true);
    expect(result.mandatoryRedStructureFailed).toBe(false);
    expect(result.mandatoryFailureReasons).toEqual([]);
  });

  it("mandatory structure is independent of the compensable conflictSeverity penalty", () => {
    const deltaPp = Array(10).fill(0);
    deltaPp[8] = 1.1;
    // RED on digit 8: winning side, but wrong parity for OVER -> scoring conflict only.
    const result = classifyRedSemantics(state({ red: 8, secondRed: 9, deltaPp }), overShape);
    expect(result.conflictSeverity).toBeGreaterThan(0);
    expect(result.mandatoryRedStructureFailed).toBe(false);
  });
});
