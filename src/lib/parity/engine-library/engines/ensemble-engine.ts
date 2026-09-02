// Precision Parity AI — Bayesian Ensemble & Online Weight Learner.
// Tracks each engine's predictive accuracy per symbol and regime, updating influence dynamically.

export interface EngineAccuracyRecord {
  engineName: string;
  totalVotes: number;
  correctVotes: number;
  accuracy: number;
  weightMultiplier: number;
}

export interface OutcomeRecord {
  wasCorrect: boolean;
  timestamp: number;
}

const STORAGE_KEY = "precision_parity_ensemble_weights_v1";

/**
 * Documented Exponential Decay Half-Life: 24 hours (86,400,000 ms).
 * Rationale: Allows ensemble weights to adapt to moving market regimes while discounting older, stale signals.
 */
export const ENSEMBLE_HALF_LIFE_MS = 24 * 60 * 60 * 1000;

interface StoredEnsembleState {
  symbolWeights: Record<
    string,
    Record<string, { total: number; correct: number; history?: OutcomeRecord[] }>
  >;
}

function loadState(): StoredEnsembleState {
  if (typeof window === "undefined") {
    return { symbolWeights: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { symbolWeights: {} };
    return JSON.parse(raw);
  } catch {
    return { symbolWeights: {} };
  }
}

function saveState(s: StoredEnsembleState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export class ParityEnsembleLearner {
  private static instance: ParityEnsembleLearner | null = null;
  private state: StoredEnsembleState;

  private constructor() {
    this.state = loadState();
  }

  public static get(): ParityEnsembleLearner {
    if (!ParityEnsembleLearner.instance) {
      ParityEnsembleLearner.instance = new ParityEnsembleLearner();
    }
    return ParityEnsembleLearner.instance;
  }

  public recordEngineOutcome(
    symbol: string,
    engineName: string,
    wasCorrect: boolean,
    timestamp = Date.now(),
  ) {
    if (!this.state.symbolWeights[symbol]) {
      this.state.symbolWeights[symbol] = {};
    }
    if (!this.state.symbolWeights[symbol][engineName]) {
      this.state.symbolWeights[symbol][engineName] = { total: 0, correct: 0, history: [] };
    }

    const rec = this.state.symbolWeights[symbol][engineName];
    rec.total++;
    if (wasCorrect) rec.correct++;
    if (!rec.history) rec.history = [];
    rec.history.push({ wasCorrect, timestamp });
    if (rec.history.length > 200) {
      rec.history = rec.history.slice(-200);
    }

    saveState(this.state);
  }

  public getEngineWeight(
    symbol: string,
    engineName: string,
    defaultWeight = 1.0,
    now = Date.now(),
  ): number {
    const sym = this.state.symbolWeights[symbol];
    if (!sym || !sym[engineName]) return defaultWeight;

    const rec = sym[engineName];
    if (rec.total < 10) return defaultWeight;

    let acc = rec.correct / rec.total;

    // Apply exponential time-decay if timestamped history is available
    if (rec.history && rec.history.length > 0) {
      let weightedTotal = 0;
      let weightedCorrect = 0;
      for (const item of rec.history) {
        const ageMs = Math.max(0, now - item.timestamp);
        const weight = Math.exp(-Math.LN2 * (ageMs / ENSEMBLE_HALF_LIFE_MS));
        weightedTotal += weight;
        if (item.wasCorrect) weightedCorrect += weight;
      }
      if (weightedTotal >= 5) {
        acc = weightedCorrect / weightedTotal;
      }
    }

    // Multiplier centered around 0.50 hit rate: 50% => 1.0, 60% => 1.4, 40% => 0.6
    const multiplier = Math.max(0.3, Math.min(1.8, 1.0 + (acc - 0.5) * 4.0));
    return defaultWeight * multiplier;
  }

  public getAccuracyReport(symbol: string, now = Date.now()): EngineAccuracyRecord[] {
    const sym = this.state.symbolWeights[symbol] || {};
    return Object.keys(sym).map((k) => {
      const rec = sym[k];
      const acc = rec.total > 0 ? rec.correct / rec.total : 0.5;
      const mult = this.getEngineWeight(symbol, k, 1.0, now);
      return {
        engineName: k,
        totalVotes: rec.total,
        correctVotes: rec.correct,
        accuracy: Number((acc * 100).toFixed(1)),
        weightMultiplier: Number(mult.toFixed(2)),
      };
    });
  }
}
