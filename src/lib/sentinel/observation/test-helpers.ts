/**
 * TEST HELPERS — OBSERVATION LAYER SEEDING
 * ========================================
 * Integration-test support only. Regression suites that exercise the full
 * Sentinel pipeline (scan → Stage 4 → Best-of-90) read the singleton
 * `observationEngine`, which returns dossiers only for cells that have
 * actually observed evidence. This helper primes every one of the 90
 * permanent cells with supporting evidence in the SAME shape the real
 * engine adapter produces, so the authoritative ranking sees the full
 * population.
 *
 * It deliberately fabricates nothing beyond evidence-input states — no
 * scoring, psychology, pressure, veto or qualification logic is
 * reimplemented here; those all run inside the real engine.
 */

import { MARKET_IDS, PROPOSITIONS } from "./constants";
import type { MarketId, Proposition } from "./constants";
import { emptyEvidenceInput } from "./engineAdapter";
import { observationEngine } from "./observationEngine";

/** A digit inside the winning zone of the given proposition. */
function winningDigit(proposition: Proposition): number {
  const barrier = parseInt(String(proposition).replace(/\D/g, ""), 10);
  if (String(proposition).startsWith("OVER")) {
    return Math.min(9, (Number.isFinite(barrier) ? barrier : 2) + 1);
  }
  return Math.max(0, (Number.isFinite(barrier) ? barrier : 7) - 1);
}

function feedCell(marketId: MarketId, proposition: Proposition, observations: number): void {
  const direction = String(proposition).startsWith("OVER") ? "OVER" : "UNDER";
  const digit = winningDigit(proposition);

  for (let i = 0; i < observations; i++) {
    const input = emptyEvidenceInput(marketId, proposition, 1000 + i * 1000);
    input.psychology = { direction, state: "COHERENT", support: "SUPPORTING" };
    input.entryDigit = {
      digit,
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
    observationEngine.ingest(input);
  }
}

/**
 * Resets the singleton engine and primes all 90 cells (15 markets x 6
 * propositions) with supporting evidence so the full observed population is
 * available to the ranking and Best-of-90 layers.
 */
export function seedObservationEngine(observationsPerCell = 40): void {
  observationEngine.resetCells();
  for (const marketId of MARKET_IDS) {
    for (const proposition of PROPOSITIONS) {
      feedCell(marketId, proposition, observationsPerCell);
    }
  }
}
