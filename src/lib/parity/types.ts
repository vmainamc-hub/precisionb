import type { Tick } from "@/lib/analytics";
import type { ParityEvidence, HardVeto, SoftBlocker, ParityContextEvidence } from "./evidence/types";
import type { MarketIntelligence } from "./market-intelligence";
import type { ParityPsychologySnapshot } from "./psychology/types";
import type { ParityProbabilityReport } from "./probability";

export type Parity = "EVEN" | "ODD";
export type CellStage = "WATCHING" | "DEVELOPING" | "MATURE" | "READY" | "DECAYING" | "REJECTED";
export type FinalState = "READY" | "WATCH" | "NO_EDGE" | "REJECTED";

export interface Parity30MarketInput {
  readonly symbol: string;
  readonly displayName: string;
  readonly digits: readonly number[];
  readonly ticks: readonly Tick[];
  readonly sourceTickId: string;
  readonly analysisVersion: number;
  readonly timestamp: number;
  readonly payoutRate?: number;
}

export interface CellIdentity {
  readonly cellId: string;
  readonly marketId: string;
  readonly parity: Parity;
  readonly index: number;
}

export interface SuitabilityBreakdown {
  readonly evidence: number;
  readonly psychology: number;
  readonly persistence: number;
  readonly regime: number;
  readonly statistical: number;
  readonly danger: number;
  readonly freshness: number;
}

export interface MaturitySnapshot {
  readonly score: number;
  readonly observations: number;
  readonly persistenceTicks: number;
  readonly supportStreak: number;
  readonly cleanStreak: number;
  readonly contradictionStreak: number;
  readonly supportiveObservations: number;
  readonly adverseObservations: number;
  readonly ageMs: number;
  readonly maturitySince: number | null;
  readonly stage: CellStage;
}

export interface Parity30CellSnapshot {
  readonly identity: CellIdentity;
  readonly firstSeen: number;
  readonly lastUpdated: number;
  readonly suitability: number;
  readonly suitabilityBreakdown: SuitabilityBreakdown;
  readonly confidence: number;
  readonly maturity: MaturitySnapshot;
  readonly netEvidence: number;
  readonly supportScore: number;
  readonly conflictScore: number;
  readonly supportingEngines: readonly string[];
  readonly opposingEngines: readonly string[];
  readonly hardBlocks: readonly string[];
  readonly softWarnings: readonly string[];
  readonly entryDigit: number | null;
  readonly entryReady: boolean;
  readonly dbotValidated: boolean | null;
  /** Calibrated probability and payout-aware lower-bound edge. */
  readonly probability: ParityProbabilityReport | null;
  /** Psychological/economic admission blockers are distinct from ranking vetoes. */
  readonly admissionBlocks: readonly string[];
  readonly sentinelSupport: number;
  readonly intelligenceQuality: number;
  readonly marketMechanism: string;
  readonly marketWhy: readonly string[];
  readonly psychology: ParityPsychologySnapshot | null;
  readonly evidenceTrace: readonly { engine: string; relation: "SUPPORT" | "OPPOSE" | "NEUTRAL"; weight: number; detail: string }[];
}

export interface CellDecision {
  readonly cell: Parity30CellSnapshot;
  rank: number;
  readonly finalState: FinalState;
  readonly reasons: readonly string[];
}

export interface Parity30MarketSnapshot {
  readonly timestamp: number;
  readonly market: { symbol: string; displayName: string };
  readonly source: { sourceTickId: string; analysisVersion: number; digitCount: number };
  readonly cells: readonly Parity30CellSnapshot[];
  readonly ranking: readonly CellDecision[];
  readonly finalCellId: string | null;
  readonly finalParity: Parity | null;
  readonly finalState: FinalState;
  readonly finalEntryDigit: number | null;
  readonly engineCount: number;
  readonly evidence: readonly ParityEvidence[];
  readonly intelligence: MarketIntelligence;
  readonly psychology: ParityPsychologySnapshot;
  readonly context: ParityContextEvidence;
  readonly hardVetoes: readonly HardVeto[];
  readonly softBlockers: readonly SoftBlocker[];
  readonly reasoning: readonly string[];
}
