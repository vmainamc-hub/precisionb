import { describe, expect, it } from "vitest";
import { validateDbotEntryReplay } from "./entry-point";
import type { EntryDigitSimResult } from "../precision-edge/bot/simulator";

function replay(overrides: Partial<EntryDigitSimResult> = {}): EntryDigitSimResult {
  return {
    entryDigit: 4,
    direction: "OVER",
    barrier: 2,
    ticks: 200,
    trades: 50,
    wins: 40,
    losses: 10,
    winRate: 0.8,
    pnl: 10,
    expectancy: 0.2,
    longestWinStreak: 6,
    currentWinStreak: 2,
    longestLossStreak: 3,
    fourWinRuns: 5,
    reachedFourWins: true,
    maxDrawdownStakes: 4,
    peakStake: 3.375,
    freshWinRate: 0.82,
    recoveryWinRate: 0.7,
    outOfSample: { trades: 20, wins: 15, winRate: 0.75 },
    trades_: [],
    ...overrides,
  };
}

describe("six-stage entry-digit DBot validation hierarchy", () => {
  it("rejects insufficient replay evidence instead of letting statistical score decide", () => {
    const result = validateDbotEntryReplay(replay({ trades: 19 }), 0.7);
    expect(result.accepted).toBe(false);
    expect(result.status).toBe("INSUFFICIENT");
  });

  it("rejects poor DBot replay even when the generic entry score could otherwise be high", () => {
    const result = validateDbotEntryReplay(
      replay({ winRate: 0.54, outOfSample: { trades: 20, wins: 9, winRate: 0.45 }, expectancy: -0.1 }),
      0.7,
    );
    expect(result.accepted).toBe(false);
    expect(result.status).toBe("REJECTED");
  });

  it("validates a DBot replay survivor below the theoretical hurdle tolerance", () => {
    const result = validateDbotEntryReplay(
      replay({ winRate: 0.66, outOfSample: { trades: 20, wins: 13, winRate: 0.65 }, expectancy: 0.05 }),
      0.7,
    );
    expect(result.accepted).toBe(true);
    expect(result.status).toBe("VALIDATED");
  });

  it("marks strong replay evidence separately from merely validated evidence", () => {
    const result = validateDbotEntryReplay(replay(), 0.7);
    expect(result.accepted).toBe(true);
    expect(result.status).toBe("STRONGLY_VALIDATED");
  });
});
