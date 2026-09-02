import { describe, expect, it } from "vitest";
import { ALL_CELL_IDS, parseCellId } from "./constants";
import { ObservationEngine } from "./observationEngine";
import { emptyEvidenceInput } from "./engineAdapter";
import { getIdentityRankingEvidence } from "./identityIntegrationContract";

describe("PrecisionSentinel — permanent identity propagation", () => {
  it("every one of the 90 cells keeps its concrete identity through the canonical ObservationEngine path", () => {
    const engine = new ObservationEngine();
    engine.resetCells();

    expect(ALL_CELL_IDS).toHaveLength(90);

    for (const id of ALL_CELL_IDS) {
      const { marketId, proposition } = parseCellId(id);
      const dossier = engine.ingest(emptyEvidenceInput(marketId, proposition, 1_000));

      expect(dossier.cellId).toBe(id);
      expect(dossier.identity).toBeDefined();
      expect(dossier.identity?.cellId).toBe(id);
      expect(dossier.identity?.marketId).toBe(marketId);
      expect(dossier.identity?.proposition).toBe(proposition);
      expect(Object.isFrozen(dossier.identity)).toBe(true);
    }
  });

  it("identity conformance is never manufactured when the live psychology/canonical evidence is absent", () => {
    const engine = new ObservationEngine();
    engine.resetCells();
    const dossier = engine.ingest(emptyEvidenceInput("R_10", "OVER2", 2_000));

    expect(dossier.identity?.cellId).toBe("R_10:OVER2");
    expect(dossier.identityConformance).toBeNull();
  });
});


describe("PrecisionSentinel — concrete identity integrity", () => {
  it("rejects a dossier whose identity belongs to another concrete cell", () => {
    const engine = new ObservationEngine();
    engine.resetCells();
    const dossier = engine.ingest(emptyEvidenceInput("R_10", "OVER2", 3_000));
    const mismatched = {
      ...dossier,
      identity: { ...(dossier.identity as any), cellId: "R_11:OVER2" },
    };
    const evidence = getIdentityRankingEvidence(mismatched);
    expect(evidence.identityIntegrity).toBe("MISMATCH");
    expect(evidence.identityConformance).toBeNull();
  });
});
