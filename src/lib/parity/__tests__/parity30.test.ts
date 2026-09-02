import { describe, expect, it } from "vitest";
import { APEX_UNIVERSE_SYMBOLS } from "@/lib/apex/universe";
import { Parity30Registry, PARITY_CELL_COUNT } from "../registry";
import { analyzeMarket30 } from "../orchestrator";
import { emptyCellState, snapshotCell, updateCell } from "../cell";

function input(symbol: string) {
  const digits = Array.from({ length: 1000 }, (_, i) => (i % 4 === 0 ? 2 : i % 4 === 1 ? 7 : i % 4 === 2 ? 4 : 9));
  const ticks = digits.map((d, i) => ({ t: i * 1000, price: 100 + (i / 100000) + d / 100 }));
  return { symbol, displayName: symbol, digits, ticks, sourceTickId: `${symbol}:1000`, analysisVersion: 1, timestamp: 1_000_000, payoutRate: 0.95 };
}

describe("Precision Parity 30-cell core", () => {
  it("creates exactly 30 permanent cells from 15 canonical markets", () => {
    const registry = new Parity30Registry();
    expect(APEX_UNIVERSE_SYMBOLS.length).toBe(15);
    expect(PARITY_CELL_COUNT).toBe(30);
    expect(registry.getAllIdentities()).toHaveLength(30);
    expect(new Set(registry.getAllIdentities().map((x) => x.cellId)).size).toBe(30);
  });

  it("keeps EVEN and ODD state independent", () => {
    const registry = new Parity30Registry();
    expect(registry.state("R_100", "EVEN")).not.toBe(registry.state("R_100", "ODD"));
    expect(registry.identity("R_100", "EVEN").cellId).toBe("R_100:EVEN");
    expect(registry.identity("R_100", "ODD").cellId).toBe("R_100:ODD");
  });

  it("produces both parity cells from one market engine run", () => {
    const registry = new Parity30Registry();
    const result = analyzeMarket30(input("R_100"), registry);
    expect(result.cells).toHaveLength(2);
    expect(result.cells.map((c) => c.identity.parity).sort()).toEqual(["EVEN", "ODD"]);
    expect(result.engineCount).toBeGreaterThan(0);
  });
});


describe("Parity cell maturity persistence", () => {
  const supportingEvidence = [{
    engine: "test-engine",
    family: "STATISTICAL" as const,
    authority: "DIRECT" as const,
    correlationGroup: "TEST",
    direction: "ODD" as const,
    strength: 0.9,
    confidence: 0.9,
    sampleAuthority: 1,
    detail: "persistent ODD evidence",
  }];

  const context = {
    regimeCompatible: true,
    statisticalAuthority: 1,
    dangerScore: 0,
    feedQuality: 100,
  };

  it("does not call a cell mature from one strong observation", () => {
    const state = emptyCellState();
    const breakdown = updateCell(state, "ODD", supportingEvidence, [], [], context, 85, 1_000);
    const snap = snapshotCell({ cellId: "R_100:ODD", marketId: "R_100", parity: "ODD", index: 1 }, state, breakdown);
    expect(snap.maturity.observations).toBe(1);
    expect(snap.maturity.stage).toBe("WATCHING");
  });

  it("requires sustained observation before maturity and survives one contrary tick", () => {
    const state = emptyCellState();
    let breakdown: ReturnType<typeof updateCell> = updateCell(state, "ODD", supportingEvidence, [], [], context, 85, 1_000);
    for (let i = 1; i < 90; i += 1) {
      breakdown = updateCell(state, "ODD", supportingEvidence, [], [], context, 85, 1_000 + i * 1_000);
    }
    let snap = snapshotCell({ cellId: "R_100:ODD", marketId: "R_100", parity: "ODD", index: 1 }, state, breakdown);
    expect(snap.maturity.observations).toBe(90);
    expect(["MATURE", "READY"]).toContain(snap.maturity.stage);

    const neutralish = [{ ...supportingEvidence[0], direction: "EVEN" as const, strength: 0.3, confidence: 0.3 }];
    breakdown = updateCell(state, "ODD", neutralish, [], [], context, 85, 91_000);
    snap = snapshotCell({ cellId: "R_100:ODD", marketId: "R_100", parity: "ODD", index: 1 }, state, breakdown);
    expect(["MATURE", "READY"]).toContain(snap.maturity.stage);
    expect(snap.maturity.observations).toBe(91);
  });
});
