import { describe, it, expect } from "vitest";
import { canonicalDigitState, contractPsychology } from "@/lib/sentinel/digit-psychology";
import { computePressureField } from "@/lib/sentinel/proposal/pressure-windows";
import { evaluateSentinelSpine, runVetoEngine } from "@/lib/sentinel/proposal";
import { mapIntelToObservationInputs } from "@/lib/sentinel/observation/engineAdapter";
import { ObservationEngine, MARKET_IDS, PROPOSITIONS } from "@/lib/sentinel/observation";
import { ALL_DIGITS } from "@/lib/sentinel/proposal/types";

describe("Sentinel 90-Cell Universe Regression Test Suite (15 Markets x 6 Contracts)", () => {
  // Deterministic 1,000-tick generator with realistic price/digit distribution
  function generate1000Ticks(seed: number): number[] {
    const digits: number[] = [];
    let state = seed;
    for (let i = 0; i < 1000; i++) {
      state = (state * 1664525 + 1013904223) % 4294967296;
      digits.push(Math.abs(state) % 10);
    }
    return digits;
  }

  it("1. builds canonical distribution and evaluates digit psychology for all 15 markets and 90 cells", () => {
    expect(MARKET_IDS.length).toBe(15);
    expect(PROPOSITIONS.length).toBe(6);

    const obsEngine = new ObservationEngine();

    let hardVetoCount = 0;
    let totalCellCount = 0;

    for (let mIdx = 0; mIdx < MARKET_IDS.length; mIdx++) {
      const symbol = MARKET_IDS[mIdx];
      const digits = generate1000Ticks(1000 + mIdx * 77);

      // 1. Build canonical 1,000-tick distribution
      const canonical = canonicalDigitState(digits);
      expect(canonical.windowSize).toBe(1000);
      expect(canonical.pct.length).toBe(10);
      const totalPct = canonical.pct.reduce((a, b) => a + b, 0);
      expect(totalPct).toBeCloseTo(100, 1);

      // 2. Pressure windows
      const pressure = computePressureField(digits.slice(-120), canonical.pct);
      expect(pressure.digits.length).toBe(10);

      // 3. Contracts
      const contracts = PROPOSITIONS.map((prop) => {
        const isOver = prop.startsWith("OVER");
        const barrier = Number(prop.replace("OVER", "").replace("UNDER", ""));
        const side = isOver ? "OVER" : "UNDER";
        const winners = isOver
          ? ALL_DIGITS.filter((d) => d > barrier)
          : ALL_DIGITS.filter((d) => d < barrier);
        return {
          id: prop,
          label: `${side} ${barrier}`,
          side,
          barrier,
          winners,
          theoretical: isOver ? (9 - barrier) / 10 : barrier / 10,
        };
      });

      const mockIntel = {
        symbol,
        updatedAt: Date.now(),
        digits,
        contracts,
        regime: { label: "CALM", strength: 0.8 },
      };

      // 4. Ingest into engineAdapter
      const mappedInputs = mapIntelToObservationInputs(mockIntel, digits);
      expect(mappedInputs.length).toBe(6);

      for (const input of mappedInputs) {
        totalCellCount++;
        // Ingest into observation engine
        const dossier = obsEngine.ingest(input);

        // Verification checks:
        // A. Not rejected purely on tick 1 / startup
        expect(dossier.state).not.toBe("REJECTED");
        if (dossier.veto.hard) hardVetoCount++;

        // B. Digit psychology produces valid direction
        expect(["OVER", "UNDER", "NONE"]).toContain(dossier.psychology.direction);

        // C. Pressure windows populated
        expect(dossier.pressure.byWindow[15]).toBeDefined();
        expect(dossier.pressure.byWindow[30]).toBeDefined();
        expect(dossier.pressure.byWindow[60]).toBeDefined();
        expect(dossier.pressure.byWindow[120]).toBeDefined();
      }
    }

    expect(totalCellCount).toBe(90);
    // Verifies no catastrophic total mass-veto (startup must allow legitimate observation)
    expect(hardVetoCount).toBeLessThan(90);
  });

  it("2. verifies zero mass rejections on Deriv startup across all 90 cells", () => {
    const obsEngine = new ObservationEngine();
    let rejectedCount = 0;

    for (let mIdx = 0; mIdx < MARKET_IDS.length; mIdx++) {
      const symbol = MARKET_IDS[mIdx];
      const digits = generate1000Ticks(54321 + mIdx * 13);

      const contracts = PROPOSITIONS.map((prop) => {
        const isOver = prop.startsWith("OVER");
        const barrier = Number(prop.replace("OVER", "").replace("UNDER", ""));
        const side = isOver ? "OVER" : "UNDER";
        const winners = isOver
          ? ALL_DIGITS.filter((d) => d > barrier)
          : ALL_DIGITS.filter((d) => d < barrier);
        return {
          id: prop,
          label: `${side} ${barrier}`,
          side,
          barrier,
          winners,
          theoretical: isOver ? (9 - barrier) / 10 : barrier / 10,
        };
      });

      const mockIntel = {
        symbol,
        updatedAt: Date.now(),
        digits,
        contracts,
      };

      const mappedInputs = mapIntelToObservationInputs(mockIntel, digits);

      for (const input of mappedInputs) {
        const dossier = obsEngine.ingest(input);

        // A cell with fresh 1000 ticks must start in WATCHING, INTERESTING or DEVELOPING, never REJECTED
        expect(dossier.state).toMatch(/^(WATCHING|INTERESTING|DEVELOPING)$/);
        if (dossier.state === "REJECTED") rejectedCount++;
      }
    }

    expect(rejectedCount).toBe(0);
  });

  it("3. verifies AGAINST_STRUCTURE is never mapped to REJECTED", () => {
    // When psychology support is OPPOSING, the cell is simply opposing / cautious, NOT hard REJECTED
    const input = mapIntelToObservationInputs(
      {
        symbol: "1HZ10V",
        updatedAt: Date.now(),
        digits: generate1000Ticks(999),
        contracts: [
          {
            id: "OVER3",
            label: "OVER 3",
            side: "OVER",
            barrier: 3,
            winners: [4, 5, 6, 7, 8, 9],
            theoretical: 0.6,
          },
        ],
      },
      generate1000Ticks(999),
    )[0];

    // Force psychology support to OPPOSING (against structure)
    input.psychology.support = "OPPOSING";
    input.psychology.state = "COHERENT";

    const obsEngine = new ObservationEngine();
    const dossier = obsEngine.ingest(input);

    expect(dossier.state).not.toBe("REJECTED");
    expect(dossier.state).toBe("WATCHING");
  });
});
