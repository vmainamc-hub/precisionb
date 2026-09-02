import { describe, it, expect } from "vitest";
import {
  ObservationCell,
  QualificationManager,
  emptyEvidenceInput,
  type EngineEvidenceInput,
} from "./index";

function feedToRipe(cell: ObservationCell, mutate?: (input: EngineEvidenceInput) => void) {
  let last: any = null;
  for (let i = 0; i < 100; i++) {
    const input = emptyEvidenceInput("1HZ10V", "UNDER6", 1000 + i * 1000);
    input.psychology = { direction: "UNDER", state: "COHERENT", support: "SUPPORTING" };
    input.entryDigit = {
      digit: 4,
      state: "VALIDATED",
      support: "SUPPORTING",
      dangerousCompetitor: false,
    };
    input.pressure.byWindow = {
      15: "SUPPORTING",
      30: "SUPPORTING",
      60: "SUPPORTING",
      120: "SUPPORTING",
    };
    input.losingSidePressure = { state: "DECLINING", severity: "NONE" };
    input.trigger = { state: "VALID" };
    input.regime = {
      classification: "TRENDING_PERSISTENT",
      confidence: 0.9,
      transitioning: false,
      compatibility: "COMPATIBLE",
    };
    input.statistics = { strength: "STRONG", sampleSize: 100 };
    mutate?.(input);
    last = cell.ingest(input);
  }
  return last;
}

describe("QualificationManager — mandatory RED structure gate", () => {
  it("attemptQualify returns null for a RIPE dossier with RED on the losing side, regardless of PsychologyScore", () => {
    const qm = new QualificationManager();
    const dossier = feedToRipe(new ObservationCell("1HZ10V", "UNDER6"), (input) => {
      input.psychology.raw = {
        digitPsychology: {
          score: 97, // deliberately high
          redSemantics: {
            mandatoryRedStructureFailed: true,
            redOnWinningSide: false,
            secondRedOnWinningSide: true,
            winningSideGainingPercentage: true,
            mandatoryFailureReasons: ["RED (digit 8) is on the losing side"],
          },
        },
      };
    });

    expect(dossier.state).toBe("RIPE");
    expect(qm.attemptQualify(dossier, Date.now())).toBeNull();
  });

  it("a lower-score, structurally clean RIPE dossier still qualifies", () => {
    const qm = new QualificationManager();
    const dossier = feedToRipe(new ObservationCell("1HZ10V", "UNDER6"), (input) => {
      input.psychology.raw = {
        digitPsychology: {
          score: 84,
          redSemantics: {
            mandatoryRedStructureFailed: false,
            redOnWinningSide: true,
            secondRedOnWinningSide: true,
            winningSideGainingPercentage: true,
            mandatoryFailureReasons: [],
          },
        },
      };
    });

    expect(dossier.state).toBe("RIPE");
    expect(qm.attemptQualify(dossier, Date.now())).not.toBeNull();
  });
});
