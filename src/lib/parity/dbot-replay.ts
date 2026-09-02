export interface ReplayResult {
  readonly trades: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly validated: boolean;
  readonly reason: string;
}

export function replayParityEntryDigit(input: { digits: readonly number[]; entryDigit: number; targetParity: "EVEN" | "ODD"; oosFraction?: number }): ReplayResult {
  const trades: boolean[] = [];
  for (let i = 0; i + 1 < input.digits.length;) {
    if (input.digits[i] !== input.entryDigit) { i++; continue; }
    const settlement = input.digits[i + 1];
    trades.push((settlement % 2 === 0) === (input.targetParity === "EVEN"));
    i += 2;
  }
  const wins = trades.filter(Boolean).length;
  const winRate = trades.length ? wins / trades.length : 0;
  const frac = Math.min(0.5, Math.max(0.1, input.oosFraction ?? 0.3));
  const start = Math.floor(trades.length * (1 - frac));
  const oos = trades.slice(start);
  const oosRate = oos.length ? oos.filter(Boolean).length / oos.length : 0;
  const validated = trades.length >= 12 && winRate >= 0.53 && oosRate >= 0.5;
  return Object.freeze({
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate,
    validated,
    reason: validated ? `Replay ${wins}/${trades.length} (${(winRate * 100).toFixed(1)}%), OOS ${(oosRate * 100).toFixed(1)}%.` : trades.length < 12 ? `Replay has only ${trades.length} trades.` : `Replay did not clear the validation bar (${(winRate * 100).toFixed(1)}%, OOS ${(oosRate * 100).toFixed(1)}%).`,
  });
}
