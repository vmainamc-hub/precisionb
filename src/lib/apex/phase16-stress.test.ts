import { describe, it, expect } from "vitest";
import { apexCore } from "@/lib/apex/core";
import { derivBus } from "@/lib/deriv/tick-bus";
import { APEX_UNIVERSE_SYMBOLS } from "@/lib/apex/universe";
import { observationEngine, mapIntelToObservationInputs } from "@/lib/sentinel/observation";

function ticks(n: number, seedInit: number) {
  const out: { t: number; price: number }[] = [];
  let price = 1000 + seedInit;
  let seed = seedInit;
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    price += ((seed / 2147483648) - 0.49) * 0.5;
    out.push({ t: now - n * 1000 + i * 1000, price: Number(price.toFixed(3)) });
  }
  return out;
}

describe("PHASE 16 STRESS", () => {
  it("full universe, repeated cycles", () => {
    apexCore.retain();
    observationEngine.resetCells();
    const syms = APEX_UNIVERSE_SYMBOLS;
    for (let s = 0; s < syms.length; s++) derivBus.setBuffer(syms[s], ticks(1000, 17 + s * 31));

    const CYCLES = 20;
    const t0 = performance.now();
    let ingested = 0;
    for (let c = 0; c < CYCLES; c++) {
      for (let s = 0; s < syms.length; s++) {
        const sym = syms[s];
        // advance the market by one real tick so identity changes
        const buf = derivBus.getTicks(sym).slice();
        const last = buf[buf.length - 1];
        derivBus.setBuffer(sym, [...buf.slice(1), { t: last.t + 1000, price: Number((last.price + 0.13).toFixed(3)) }]);
        apexCore.analyse(sym);
        const intel = apexCore.getAll().find((i) => i.symbol === sym)!;
        for (const input of mapIntelToObservationInputs(intel, derivBus.getDigits(sym))) {
          observationEngine.ingest(input);
          ingested++;
        }
      }
    }
    const t1 = performance.now();
    const stats = observationEngine.getIngestStats();
    const mem = process.memoryUsage().heapUsed / 1048576;

    // Replay the LAST cycle verbatim: every observation must be a duplicate.
    const dupBefore = observationEngine.getIngestStats().duplicates;
    for (const sym of syms) {
      const intel = apexCore.getAll().find((i) => i.symbol === sym)!;
      for (const input of mapIntelToObservationInputs(intel, derivBus.getDigits(sym))) {
        observationEngine.ingest(input);
      }
    }
    const dupAfter = observationEngine.getIngestStats().duplicates;

    console.log(JSON.stringify({
      markets: syms.length,
      cycles: CYCLES,
      ingestCalls: ingested,
      accepted: stats.accepted,
      duplicates: stats.duplicates,
      stale: stats.stale,
      weakIdentity: stats.weakIdentity,
      totalMs: +(t1 - t0).toFixed(1),
      msPerCycle: +((t1 - t0) / CYCLES).toFixed(2),
      msPerCell: +((t1 - t0) / ingested).toFixed(3),
      heapMB: +mem.toFixed(1),
      replayDuplicates: dupAfter - dupBefore,
    }, null, 2));

    expect(dupAfter - dupBefore).toBe(syms.length * 6);
    expect(stats.stale).toBe(0);
  }, 300000);
});
