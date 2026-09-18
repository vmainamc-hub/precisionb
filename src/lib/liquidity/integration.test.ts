import { describe, expect, it } from "vitest";
import { analyzeMarket } from "./engine";

function history() {
  return Array.from({ length: 1000 }, function (_, i) {
    const d = i % 10 < 7 ? (i * 3) % 7 : 7 + (i % 3);
    return { q: 100 + i * 0.001, d, t: 1_700_000_000 + i };
  });
}

describe("DigitPulse liquidity integration", function () {
  it("keeps the full 1000-tick psychology and liquidity lifecycle in one analysis", function () {
    const result = analyzeMarket(history(), "1HZ10V");
    expect(result).not.toBeNull();
    expect(result?.sample).toBe(1000);
    expect(result?.f1000).toHaveLength(10);
    expect(result?.sentinelPsychology).toBeTruthy();
    expect(result?.contracts.length).toBeGreaterThan(0);
    expect(result?.contracts.some(function (c) { return Boolean(c.v3); })).toBe(true);
    expect(result?.top).toBeTruthy();
  });

  it("evaluates both Over and Under contract families", function () {
    const result = analyzeMarket(history(), "R_50");
    expect(result?.contracts.some(function (c) { return c.kind === "OVER"; })).toBe(true);
    expect(result?.contracts.some(function (c) { return c.kind === "UNDER"; })).toBe(true);
  });

  it("does not describe hidden order flow as observable fact", function () {
    const result = analyzeMarket(history(), "R_50");
    expect(result?.contracts.every(function (c) { return !c.evidence?.some(function (x) { return /hidden order|manipulation/i.test(x); }); })).toBe(true);
  });
});