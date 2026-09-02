import { describe, it, expect } from "vitest";
import {
  CELL_IDENTITIES,
  CELL_IDENTITY_TEMPLATES,
  createCellIdentity,
  buildCellIdentity,
  deriveIdentityConformance,
  type CellIdentity,
  type CellIdentityRules,
} from "./cellIdentity";
import { ALL_CELL_IDS, MARKET_IDS, PROPOSITIONS, parseCellId } from "./constants";
import { ObservationCell } from "./observationCell";
import { emptyEvidenceInput } from "./engineAdapter";
import { canonicalDigitState, contractPsychology } from "@/lib/sentinel/digit-psychology";

describe("Cell Identity — permanent psychological constitution", () => {
  it("1. the canonical universe is 90 cells across 15 markets x 6 propositions", () => {
    expect(MARKET_IDS.length).toBe(15);
    expect(PROPOSITIONS.length).toBe(6);
    expect(ALL_CELL_IDS.length).toBe(90);
  });

  it("2. every canonical proposition has a deterministic immutable identity template", () => {
    for (const p of PROPOSITIONS) {
      expect(CELL_IDENTITIES[p]).toBeDefined();
      expect(CELL_IDENTITIES[p].proposition).toBe(p);
    }
    expect(Object.keys(CELL_IDENTITY_TEMPLATES).length).toBe(6);
  });

  it("3. identity is frozen / immutable — mutation attempts are silently rejected or throw", () => {
    const identity = CELL_IDENTITIES.OVER2;
    expect(Object.isFrozen(identity)).toBe(true);
    // ESM modules run in strict mode, so writing to a frozen object throws —
    // that IS the immutability guarantee (§6). Assert it throws and the
    // value is left untouched.
    expect(() => {
      (identity as any).barrier = 999;
    }).toThrow();
    expect(identity.barrier).toBe(2);
  });

  it("4. all 90 concrete cells receive distinct permanent identity records", () => {
    const cells = ALL_CELL_IDS.map((id) => {
      const parsed = parseCellId(id);
      return new ObservationCell(parsed.marketId, parsed.proposition);
    });
    expect(cells).toHaveLength(90);
    expect(new Set(cells.map((c) => c.identity.cellId)).size).toBe(90);
    expect(new Set(cells.map((c) => c.identity)).size).toBe(90);
    expect(cells[0].identity.marketId).toBe(parseCellId(ALL_CELL_IDS[0]).marketId);
    expect(cells[0].identity.proposition).toBe(parseCellId(ALL_CELL_IDS[0]).proposition);
  });

  it("5. identity never changes across many ticks, however the market moves", () => {
    const cell = new ObservationCell("R_10", "OVER2");
    const originalIdentity = cell.identity;
    for (let i = 0; i < 200; i++) {
      const input = emptyEvidenceInput("R_10", "OVER2", 1000 + i * 1000);
      input.psychology = {
        direction: i % 2 === 0 ? "OVER" : "UNDER",
        state: i % 2 === 0 ? "STRENGTHENING" : "WEAKENING",
        support: i % 2 === 0 ? "SUPPORTING" : "OPPOSING",
      };
      cell.ingest(input);
    }
    expect(cell.identity).toBe(originalIdentity);
    expect(cell.identity.cellId).toBe("R_10:OVER2");
    expect(cell.identity.proposition).toBe("OVER2");
    expect(cell.identity.winningDigits).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it("6. concrete identities share immutable rule values without sharing identity objects", () => {
    const a = new ObservationCell(MARKET_IDS[0], "OVER2");
    const b = new ObservationCell(MARKET_IDS[1], "OVER2");
    expect(a.identity).not.toBe(b.identity);
    expect(a.identity.proposition).toBe(b.identity.proposition);
    expect(a.identity.winningDigits).toEqual(b.identity.winningDigits);
    expect(Object.isFrozen(a.identity)).toBe(true);
    expect(Object.isFrozen(a.identity.winningDigits)).toBe(true);
  });

  it("7. OVER propositions and UNDER propositions have mirror-opposite identities", () => {
    const over2 = CELL_IDENTITIES.OVER2;
    const under7 = CELL_IDENTITIES.UNDER7;
    expect(over2.side).toBe("OVER");
    expect(under7.side).toBe("UNDER");
    expect(over2.greenParity).toBe("EVEN");
    expect(under7.greenParity).toBe("ODD");
    expect(over2.redParity).toBe("ODD");
    expect(under7.redParity).toBe("EVEN");
    expect(over2.extremeDigit).toBe(0);
    expect(under7.extremeDigit).toBe(9);
    expect(over2.redExcludedDigit).toBe(1);
    expect(under7.redExcludedDigit).toBe(8);
  });

  it("8. winning/losing digits are proposition-specific and correctly partition 0-9", () => {
    for (const p of PROPOSITIONS) {
      const id = CELL_IDENTITIES[p];
      const all = [...id.winningDigits, ...id.losingDigits].sort((a, b) => a - b);
      expect(all).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(id.winningDigits.length + id.losingDigits.length).toBe(10);
    }
  });

  it("9. the exact same live digit distribution is interpreted differently by different identities", () => {
    // A distribution where 7 is unambiguously the strongest recent gainer:
    // a long uniform base, then the most recent 200 ticks flood on digit 7
    // so its recent share (~100%) is far above its canonical share (~28%).
    const digits: number[] = [];
    for (let i = 0; i < 1000; i++) digits.push(i % 10);
    for (let i = 0; i < 200; i++) digits.push(7);
    const canonical = canonicalDigitState(digits);
    expect(canonical.mostIncreasing).toBe(7);

    const over2Psych = contractPsychology(canonical, {
      label: "Over 2",
      side: "OVER",
      barrier: 2,
      winners: [...CELL_IDENTITIES.OVER2.winningDigits],
    });
    const under6Psych = contractPsychology(canonical, {
      label: "Under 6",
      side: "UNDER",
      barrier: 6,
      winners: [...CELL_IDENTITIES.UNDER6.winningDigits],
    });

    const over2Conf = deriveIdentityConformance(CELL_IDENTITIES.OVER2, over2Psych, canonical);
    const under6Conf = deriveIdentityConformance(CELL_IDENTITIES.UNDER6, under6Psych, canonical);

    // Same market snapshot, two different identities — the interpretation of
    // "most increasing = 7" must differ (7 supports OVER2's winning side,
    // conflicts with UNDER6's).
    expect(over2Conf.mostIncreasingSupportsIdentity).not.toBe(under6Conf.mostIncreasingSupportsIdentity);
  });

  it("10. no fake pass: identity conformance components are null (not a false pass) when unmeasurable", () => {
    const emptyState = canonicalDigitState([]);
    const psych = contractPsychology(emptyState, {
      label: "Over 2",
      side: "OVER",
      barrier: 2,
      winners: [...CELL_IDENTITIES.OVER2.winningDigits],
    });
    const conf = deriveIdentityConformance(CELL_IDENTITIES.OVER2, psych, emptyState);
    expect(conf.greenPass).toBeNull();
    expect(conf.redPass).toBeNull();
    expect(conf.stabilityWatch).toBe("UNKNOWN");
  });

  it("11. determinism: identical inputs produce identical identity + conformance every time", () => {
    const digits = Array.from({ length: 1000 }, (_, i) => (i * 7) % 10);
    const canonical = canonicalDigitState(digits);
    const psych = contractPsychology(canonical, {
      label: "Over 1",
      side: "OVER",
      barrier: 1,
      winners: [...CELL_IDENTITIES.OVER1.winningDigits],
    });
    const runA = deriveIdentityConformance(CELL_IDENTITIES.OVER1, psych, canonical);
    const runB = deriveIdentityConformance(CELL_IDENTITIES.OVER1, psych, canonical);
    expect(runA).toEqual(runB);
    expect(buildCellIdentity("OVER1")).toEqual(buildCellIdentity("OVER1"));
  });

  it("11. identity is auditable from a dossier without recomputing anything", () => {
    const cell = new ObservationCell("R_25", "UNDER7");
    const input = emptyEvidenceInput("R_25", "UNDER7", 5000);
    const dossier = cell.ingest(input);
    expect(dossier.identity).toBe(cell.identity);
    expect(dossier.identity?.cellId).toBe("R_25:UNDER7");
    expect(dossier.identity?.proposition).toBe("UNDER7");
    // identityConformance is present (possibly null pre-warmup) but never throws.
    expect("identityConformance" in dossier).toBe(true);
  });

  it("13. hard-blocked mandatory RED structure forces identity conformance to FAILED, regardless of other components", () => {
    const identity: CellIdentityRules = CELL_IDENTITIES.OVER2;
    const digits: number[] = [];
    for (let i = 0; i < 1200; i++) digits.push(i % 10 === 1 ? 1 : (i % 10 === 0 ? 3 : 5));
    const canonical = canonicalDigitState(digits);
    const psych = contractPsychology(canonical, {
      label: "Over 2",
      side: "OVER",
      barrier: 2,
      winners: [...identity.winningDigits],
    });
    // Force the hard-block flag directly to prove the conformance label
    // respects it regardless of everything else (§28/§56 — danger/hard
    // vetoes are never rescued by a good-looking generic reading).
    const forced = { ...psych, hardBlock: true };
    const conf = deriveIdentityConformance(identity, forced, canonical);
    expect(conf.label).toBe("FAILED");
  });

  it("14. cell identity cannot be reassigned by an unrelated cell's evolution (independence)", () => {
    const cellA = new ObservationCell("R_10", "OVER2");
    const cellB = new ObservationCell("R_10", "UNDER7");
    const beforeA = cellA.identity;
    for (let i = 0; i < 50; i++) {
      cellB.ingest(emptyEvidenceInput("R_10", "UNDER7", 1000 + i * 1000));
    }
    expect(cellA.identity).toBe(beforeA);
    expect(cellA.identity).not.toBe(cellB.identity);
  });

  it("15. parseCellId + identity together reconstruct a fully-explained cell name", () => {
    const { marketId, proposition } = parseCellId(`${MARKET_IDS[3]}:OVER3`);
    expect(CELL_IDENTITIES[proposition].proposition).toBe("OVER3");
    expect(marketId).toBe(MARKET_IDS[3]);
  });
});
