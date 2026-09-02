import { describe, expect, it } from "vitest";
import { simulateBotSessionForEntryDigit } from "./simulator";

function makeHistory(): number[] {
  const out: number[] = [];
  // Repeated activation episodes. Each episode prints 4, then creates a
  // complete six-tick OVER trigger and a winning settlement. The next run is
  // intentionally separated so settlement ticks cannot become openings.
  for (let k = 0; k < 30; k++) {
    out.push(4, 5, 6, 5, 7, 8, 9, 9, 3, 4);
  }
  return out;
}

describe("real-bot entry session replay", () => {
  it("activates on the entry digit, waits for the real six-tick trigger, and settles on the following tick", () => {
    const r = simulateBotSessionForEntryDigit(makeHistory(), 4, "OVER", {
      stopAfterRuns: 1,
      maxLosses: 3,
      ladderDepth: 3,
    });
    expect(r.sessions).toBeGreaterThan(0);
    expect(r.triggeredSessions).toBeGreaterThan(0);
    expect(r.firstRunTrades).toBeGreaterThan(0);
    expect(r.firstRunWinRate).toBe(1);
    expect(r.medianTriggerLatencyTicks).toBeGreaterThanOrEqual(6);
    expect(r.sessions_[0].firstTriggerIndex).toBe(r.sessions_[0].entryIndex + 6);
    expect(r.sessions_[0].trades_[0].settlementIndex).toBe(r.sessions_[0].trades_[0].triggerIndex + 1);
  });

  it("keeps an opposite bot trigger idle instead of forcing a contract", () => {
    const digits = [4, 1, 2, 3, 0, 1, 2, 1, 2, 3, 0, 1, 2, 1, 2];
    const r = simulateBotSessionForEntryDigit(digits, 4, "OVER", { stopAfterRuns: 1 });
    expect(r.sessions).toBe(1);
    expect(r.sessions_[0].firstTriggerDirection).toBe("UNDER");
    expect(r.sessions_[0].trades).toBe(0);
  });
});
