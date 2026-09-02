import { derivBus } from "@/lib/deriv/tick-bus";
import { APEX_UNIVERSE_SYMBOLS } from "@/lib/apex/universe";
import { analyzeMarket30, marketName } from "./orchestrator";
import { Parity30Registry } from "./registry";
import type { Parity30MarketSnapshot } from "./types";

export type RuntimeStatus = "OFFLINE" | "WARMING" | "LIVE" | "STALE";

export interface Parity30RuntimeView {
  readonly snapshots: readonly Parity30MarketSnapshot[];
  readonly cells: readonly Parity30MarketSnapshot["cells"][number][];
  readonly top: Parity30MarketSnapshot["ranking"][number] | null;
  readonly finalCell: Parity30MarketSnapshot["cells"][number] | null;
  readonly status: RuntimeStatus;
  readonly lastRunAt: number;
  readonly analyzing: boolean;
  readonly error: string | null;
}

class Parity30Runtime {
  readonly registry = new Parity30Registry();
  private snapshots = new Map<string, Parity30MarketSnapshot>();
  private listeners = new Set<() => void>();
  private version = 0;
  private running = false;
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastRunAt = 0;
  private error: string | null = null;

  subscribe(cb: () => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  getVersion() { return this.version; }
  private emit() { this.version++; this.listeners.forEach((cb) => cb()); }

  start() {
    if (this.running) return;
    this.running = true;
    this.scheduleAll(0);
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(symbol?: string, delay = 250) {
    if (symbol) this.pending.add(symbol);
    else APEX_UNIVERSE_SYMBOLS.forEach((s) => this.pending.add(s));
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private scheduleAll(delay: number) { this.schedule(undefined, delay); }

  private async flush() {
    if (!this.running || this.pending.size === 0) return;
    const symbols = [...this.pending];
    this.pending.clear();
    const started = performance.now();
    this.error = null;
    try {
      for (const symbol of symbols) {
        const ticks = derivBus.getTicks(symbol);
        const digits = derivBus.getDigits(symbol);
        if (digits.length < 60 || ticks.length < 60) continue;
        const last = ticks[ticks.length - 1];
        const previous = this.snapshots.get(symbol);
        const sourceTickId = `${symbol}:${last?.t ?? 0}:${digits.length}:${digits[digits.length - 1] ?? "x"}`;
        if (previous?.source.sourceTickId === sourceTickId) continue;
        const snapshot = analyzeMarket30({
          symbol,
          displayName: marketName(symbol),
          digits,
          ticks,
          sourceTickId,
          analysisVersion: (previous?.source.analysisVersion ?? 0) + 1,
          timestamp: Date.now(),
          payoutRate: 0.95,
        }, this.registry);
        this.snapshots.set(symbol, snapshot);
      }
      this.lastRunAt = Date.now();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    void started;
    this.emit();
  }

  getView(): Parity30RuntimeView {
    const snapshots = [...this.snapshots.values()].sort((a, b) => a.market.symbol.localeCompare(b.market.symbol));
    const liveCells = snapshots.flatMap((s) => s.cells);
    const liveIds = new Set(liveCells.map((c) => c.identity.cellId));
    const cells = [...liveCells, ...this.registry.getAllSnapshots().filter((c) => !liveIds.has(c.identity.cellId))].sort((a, b) => a.identity.index - b.identity.index);
    const eligible = [...cells].filter((c) => c.maturity.observations > 0 && c.maturity.stage !== "REJECTED");
    const top = eligible.sort((a, b) => b.suitability - a.suitability || b.maturity.score - a.maturity.score || a.identity.index - b.identity.index)[0];
    const finalCandidates = snapshots
      .filter((s) => s.finalState === "READY" && s.finalCellId)
      .map((s) => s.cells.find((c) => c.identity.cellId === s.finalCellId))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    const finalCell = finalCandidates.sort((a, b) => b.suitability - a.suitability || b.maturity.score - a.maturity.score)[0] ?? null;
    const now = Date.now();
    const status: RuntimeStatus = this.error ? "STALE" : this.lastRunAt === 0 ? "WARMING" : now - this.lastRunAt > 5000 ? "STALE" : "LIVE";
    return {
      snapshots,
      cells,
      top: top ? { cell: top, rank: 1, finalState: top.maturity.stage === "READY" ? "READY" : "WATCH", reasons: [] } : null,
      finalCell,
      status,
      lastRunAt: this.lastRunAt,
      analyzing: Boolean(this.timer) || this.pending.size > 0,
      error: this.error,
    };
  }

  reset() {
    this.snapshots.clear();
    this.registry.reset();
    this.lastRunAt = 0;
    this.error = null;
    this.emit();
  }
}

export const parity30Runtime = new Parity30Runtime();
