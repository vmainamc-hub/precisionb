// Regression + stress coverage for the exactly-once Sentinel ingestion
// architecture: deterministic dedup, read-only ranking, and the memoised
// EntryLab / exposure / snapshot caches.
import { describe, it, expect, beforeEach } from "vitest";

import {
  ObservationEngine,
  emptyEvidenceInput,
  type EngineEvidenceInput,
} from "./observation";
import { adapterCacheStats, resetAdapterCache } from "./observation/engineAdapter";
import { entryLab } from "@/lib/apex/entry-conditions";
import {
  losingDigitExposure,
  exposureCacheStats,
  resetExposureCache,
} from "@/lib/apex/exposure";

function evidence(symbol: string, prop: string, ts: number): EngineEvidenceInput {
  const input = emptyEvidenceInput(symbol, prop as never, ts);
  input.statistics = { strength: "STRONG", sampleSize: 100 };
  return input;
}

describe("exactly-once observation ingestion", () => {
  let engine: ObservationEngine;

  beforeEach(() => {
    engine = new ObservationEngine();
  });

  it("accepts each distinct timestamp exactly once", () => {
    for (let i = 0; i < 50; i++) engine.ingest(evidence("1HZ10V", "UNDER6", 1000 + i * 1000));
    const stats = engine.getIngestStats();
    expect(stats.accepted).toBe(50);
    expect(stats.duplicates).toBe(0);
  });

  it("rejects duplicate observations for the same cell + timestamp", () => {
    const input = evidence("1HZ10V", "UNDER6", 5000);
    engine.ingest(input);
    engine.ingest({ ...input });
    engine.ingest({ ...input });
    const stats = engine.getIngestStats();
    expect(stats.accepted).toBe(1);
    expect(stats.duplicates).toBe(2);
  });

  it("rejects out-of-order (stale) observations", () => {
    engine.ingest(evidence("1HZ10V", "UNDER6", 9000));
    engine.ingest(evidence("1HZ10V", "UNDER6", 3000));
    const stats = engine.getIngestStats();
    expect(stats.accepted).toBe(1);
    expect(stats.accepted + stats.duplicates).toBeGreaterThanOrEqual(1);
  });

  it("keeps per-cell dedup independent across markets and propositions", () => {
    engine.ingest(evidence("1HZ10V", "UNDER6", 1000));
    engine.ingest(evidence("1HZ25V", "UNDER6", 1000));
    engine.ingest(evidence("1HZ10V", "OVER3", 1000));
    expect(engine.getIngestStats().accepted).toBe(3);
  });

  it("stress: 5k mixed duplicate/ordered observations stay deterministic", () => {
    for (let i = 0; i < 2500; i++) {
      const input = evidence("1HZ10V", "UNDER6", 1000 + i * 1000);
      engine.ingest(input);
      engine.ingest({ ...input }); // exact duplicate
    }
    const stats = engine.getIngestStats();
    expect(stats.accepted).toBe(2500);
    expect(stats.duplicates).toBe(2500);
  });

  it("resetIngestGuards clears the counters", () => {
    engine.ingest(evidence("1HZ10V", "UNDER6", 1000));
    engine.resetIngestGuards();
    expect(engine.getIngestStats().accepted).toBe(0);
  });
});

describe("snapshot adapter cache", () => {
  it("exposes cache telemetry and can be reset", () => {
    resetAdapterCache();
    const stats = adapterCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});

describe("exposure cache", () => {
  beforeEach(() => resetExposureCache());

  it("returns an identical, cached report for identical immutable inputs", () => {
    const digits = Array.from({ length: 120 }, (_, i) => i % 10);
    const winners = [0, 1, 2, 3, 4, 5];
    const a = losingDigitExposure(digits, winners, null, null, "UNDER6");
    const b = losingDigitExposure(digits, winners, null, null, "UNDER6");
    expect(b).toBe(a);
    const stats = exposureCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it("recomputes when the tick stream advances", () => {
    const digits = Array.from({ length: 120 }, (_, i) => i % 10);
    const winners = [0, 1, 2, 3, 4, 5];
    losingDigitExposure(digits, winners, null, null, "UNDER6");
    losingDigitExposure([...digits, 7], winners, null, null, "UNDER6");
    expect(exposureCacheStats().misses).toBe(2);
  });
});

describe("EntryLab ledger-versioned cache", () => {
  beforeEach(() => entryLab.reset());

  it("serves repeated reads from cache at a stable ledger version", () => {
    const before = entryLab.cacheStats();
    const a = entryLab.statsFor("1HZ10V", "UNDER6" as never, 0.6);
    const b = entryLab.statsFor("1HZ10V", "UNDER6" as never, 0.6);
    expect(b).toBe(a);
    expect(entryLab.cacheStats().hits).toBeGreaterThan(before.hits);
  });

  it("invalidates cached results when the ledger version moves", () => {
    const version = entryLab.getLedgerVersion();
    const a = entryLab.statsFor("1HZ10V", "UNDER6" as never, 0.6);
    entryLab.setConfig({ stake: entryLab.getConfig().stake });
    expect(entryLab.getLedgerVersion()).toBeGreaterThan(version);
    const b = entryLab.statsFor("1HZ10V", "UNDER6" as never, 0.6);
    expect(b).not.toBe(a);
  });
});
