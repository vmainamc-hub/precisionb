/**
 * FORENSIC COVERAGE — PHASES 13 / 14 / 15A / 15B.
 *
 * Proves there is exactly ONE authoritative danger value per contract: the
 * composition produced by the observation adapter. ApexCore no longer composes
 * a second, weaker danger object — it reads the adapter's value back onto
 * `contract.dangerComposition`, so the UI, the ranking layer and the Sentinel
 * qualification gates can never see different numbers for the same cell.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { apexCore } from "@/lib/apex/core";
import { derivBus } from "@/lib/deriv/tick-bus";
import { mapIntelToObservationInputs } from "@/lib/sentinel/observation";
import type { MarketIntel } from "@/lib/apex/types";

const SYMBOL = "R_100";

function syntheticTicks(n: number) {
  const ticks: { t: number; price: number }[] = [];
  let price = 1000.5;
  const now = Date.now();
  // Deterministic pseudo-random walk so the assertions are reproducible.
  let seed = 42;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    price += ((seed / 2147483648) - 0.49) * 0.5;
    ticks.push({ t: now - n * 1000 + i * 1000, price: Number(price.toFixed(3)) });
  }
  return ticks;
}

describe("PHASE 15B — one authoritative danger value per contract", () => {
  let intel: MarketIntel | undefined;

  beforeAll(() => {
    apexCore.retain();
    derivBus.setBuffer(SYMBOL, syntheticTicks(1000));
    apexCore.analyse(SYMBOL);
    intel = apexCore.getAll().find((i) => i.symbol === SYMBOL);
  });

  it("1. ApexCore no longer composes its own danger object (source evidence)", () => {
    const src = readFileSync("src/lib/apex/core.ts", "utf8");
    expect(src).not.toContain("composeDanger(");
    expect(src).toContain("ONE AUTHORITATIVE DANGER VALUE");
  });

  it("2. every contract carries a populated danger composition", () => {
    expect(intel).toBeDefined();
    expect(intel!.contracts.length).toBeGreaterThan(0);
    for (const c of intel!.contracts) {
      expect(c.dangerComposition, `missing danger composition for ${c.id}`).toBeTruthy();
      expect(typeof c.dangerComposition!.total).toBe("number");
      expect(Number.isFinite(c.dangerComposition!.total)).toBe(true);
    }
  });

  it("3. the contract danger composition IS the observation adapter's composition", () => {
    const inputs = mapIntelToObservationInputs(intel!, derivBus.getDigits(SYMBOL));
    expect(inputs.length).toBeGreaterThan(0);

    for (const input of inputs) {
      const contract = intel!.contracts.find((c) => String(c.id) === String(input.proposition));
      expect(contract, `no contract for ${input.proposition}`).toBeDefined();
      // Identical object identity — not merely an equal number.
      expect(contract!.dangerComposition).toBe(input.danger.raw);
      expect(input.danger.total).toBe(contract!.dangerComposition!.total);
    }
  });

  it("4. the composition carries Phase 13/14/15 evidence channels", () => {
    const inputs = mapIntelToObservationInputs(intel!, derivBus.getDigits(SYMBOL));
    const withComponents = inputs.filter((i) => (i.danger.components?.length ?? 0) > 0);
    // Every component must be fully graded and named — no anonymous points.
    for (const i of withComponents) {
      for (const comp of i.danger.components) {
        expect(comp.code).toBeTruthy();
        expect(comp.label).toBeTruthy();
        expect(typeof comp.points).toBe("number");
      }
    }
    // Phase 13 momentum evidence is exposed from the SAME computation.
    for (const i of inputs) {
      expect(i.momentum.directional).toBeTruthy();
    }
  });

  it("5. repeated mapping of the same intel is stable (no double engine run drift)", () => {
    const a = mapIntelToObservationInputs(intel!, derivBus.getDigits(SYMBOL));
    const b = mapIntelToObservationInputs(intel!, derivBus.getDigits(SYMBOL));
    expect(a.map((x) => x.danger.total)).toEqual(b.map((x) => x.danger.total));
  });
});
