/**
 * DigitPulse -> Precision Sentinel bridge.
 *
 * IMPORTANT: this adapter does not open a WebSocket and does not create a second
 * tick store. Precision Sentinel's DerivTickBus remains the sole authoritative
 * live market feed. DigitPulse liquidity/psychology consumes the same canonical
 * 1,000-tick history.
 */
import { derivBus } from "@/lib/deriv/tick-bus";
import { analyzeMarket, type MarketAnalysis, type Tick as LiquidityTick } from "./engine";

export interface UnifiedLiquiditySnapshot {
  symbol: string;
  ticks: LiquidityTick[];
  analysis: MarketAnalysis | null;
  feedStatus: ReturnType<typeof derivBus.getStatus>;
}

function toLiquidityTicks(symbol: string): LiquidityTick[] {
  const ticks = derivBus.getTicks(symbol);
  const digits = derivBus.getDigits(symbol);
  return ticks.slice(-1000).map((tick, i) => ({
    q: tick.price,
    t: tick.t,
    d: digits[digits.length - Math.min(digits.length, ticks.length) + i] ?? 0,
  }));
}

export function analyzeLiquidityFromCanonicalBus(symbol: string): UnifiedLiquiditySnapshot {
  const ticks = toLiquidityTicks(symbol);
  return {
    symbol,
    ticks,
    analysis: ticks.length >= 20 ? analyzeMarket(ticks, symbol) : null,
    feedStatus: derivBus.getStatus(),
  };
}

export function subscribeLiquidityAnalysis(
  symbol: string,
  listener: (snapshot: UnifiedLiquiditySnapshot) => void,
): () => void {
  const emit = () => listener(analyzeLiquidityFromCanonicalBus(symbol));
  emit();
  return derivBus.onTick((changedSymbol) => {
    if (changedSymbol === symbol) emit();
  });
}
