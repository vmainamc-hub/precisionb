import { describe, expect, it } from "vitest";
import { observeLiquiditySweep } from "./liquidity-sweep";

const under7Sweep = [
  // 30-tick opposing-side baseline: low concentration.
  0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0,
  1, 2, 3, 4, 7, 5, 6, 0, 1, 2, 3, 4, 5, 6, 8,
  // 15-tick opposing concentration peak.
  7, 8, 9, 7, 8, 9, 7, 8, 9, 0, 1, 2, 3, 4, 5,
  // 15-tick release/transition toward the winning zone.
  0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 7,
];

describe("proposition-aware liquidity sweep observation", () => {
  it("confirms an observed concentration → peak → exhaustion → release → transition for UNDER 7", () => {
    const r = observeLiquiditySweep(under7Sweep, "UNDER", 7);
    expect(r.confirmed).toBe(true);
    expect(r.state).toBe("CONFIRMED");
    expect(r.observedBuild).toBe(true);
    expect(r.observedExhaustion).toBe(true);
    expect(r.observedRelease).toBe(true);
    expect(r.observedBoundaryWeakening).toBe(true);
    expect(r.observedWinningTransition).toBe(true);
    expect(r.concentrationReleasePp).toBeGreaterThanOrEqual(2);
    expect(r.winningAdvancePp).toBeGreaterThanOrEqual(1);
  });

  it("does not call a high opposing concentration alone a sweep", () => {
    const digits = [
      ...Array(45).fill(7),
      ...Array(15).fill(8),
    ];
    const r = observeLiquiditySweep(digits, "UNDER", 7);
    expect(r.confirmed).toBe(false);
  });

  it("fails closed when there is not enough history", () => {
    const r = observeLiquiditySweep(Array(59).fill(7), "UNDER", 7);
    expect(r.confirmed).toBe(false);
    expect(r.state).toBe("INSUFFICIENT");
  });

  it("mirrors the proposition for OVER 6", () => {
    const digits = [
      ...Array(30).fill(7),
      ...[6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7],
      ...Array(15).fill(7),
    ];
    const r = observeLiquiditySweep(digits, "OVER", 6);
    expect(r.confirmed).toBe(true);
  });
});
