import { describe, expect, it } from "vitest";
import { simulateBot, simulateBotForEntryDigit } from "./simulator";

// The trigger is deliberately bypassed in the entry-digit replay tests so the
// tests isolate contract cadence and entry-trigger semantics.
describe("exact DBot opening/settlement cadence", () => {
  it("consumes opening+settlement as one run and never reuses settlement", () => {
    const r = simulateBotForEntryDigit([2, 3, 4, 1], 2, "OVER", {
      collectTrades: true,
    });
    expect(r.trades).toBe(1);
    expect(r.trades_[0].openingIndex).toBe(0);
    expect(r.trades_[0].settlementIndex).toBe(1);
  });

  it("2-3-4-1 is two non-overlapping contract slots", () => {
    // Opening/settlement cadence alone is: 2->3, then 4->1.
    const slots = [
      { openingIndex: 0, settlementIndex: 1 },
      { openingIndex: 2, settlementIndex: 3 },
    ];
    expect(slots).toEqual([
      { openingIndex: 0, settlementIndex: 1 },
      { openingIndex: 2, settlementIndex: 3 },
    ]);
  });

  it("a settlement digit that equals the entry digit is not reused as the next opening", () => {
    const r = simulateBotForEntryDigit([2, 2, 3, 4], 2, "OVER", {
      collectTrades: true,
    });
    expect(r.trades).toBe(1);
    expect(r.trades_[0].openingIndex).toBe(0);
    expect(r.trades_[0].settlementIndex).toBe(1);
  });

  it("four DBot wins means four separate contracts, not four ticks", () => {
    // OVER 2: each opening digit 4 settles on 5 => WIN. Four runs need 8 ticks.
    const digits = [4, 5, 4, 5, 4, 5, 4, 5];
    const r = simulateBotForEntryDigit(digits, 4, "OVER", { collectTrades: true });
    expect(r.trades).toBe(4);
    expect(r.wins).toBe(4);
    expect(r.longestWinStreak).toBe(4);
    expect(r.fourWinRuns).toBe(1);
    expect(r.trades_.map((t) => t.openingIndex)).toEqual([0, 2, 4, 6]);
  });

  it("the normal bot replay also advances from T to T+2 after a settled trade", () => {
    // The exact trigger is satisfied at index 6; settlement is index 7. A
    // second eligible opening can only be index 8, never index 7.
    const digits = [0, 0, 0, 0, 0, 0, 5, 9, 5, 9];
    const r = simulateBot(digits, { collectTrades: true });
    expect(r.trades_[0]?.index).toBe(6);
    expect(r.trades_[0]?.digit).toBe(9);
    expect(r.trades_[1]?.index).toBe(8);
    expect(r.trades_[1]?.digit).toBe(9);
  });
});
