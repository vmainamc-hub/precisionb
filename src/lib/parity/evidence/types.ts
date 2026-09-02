/**
 * PARITY INTELLIGENCE — CANONICAL TYPES
 * ====================================================================
 * Normalized evidence contracts used by the single canonical 30-cell Parity system.
 * Engine mathematics lives under `engine-library`; cells and arbitration live
 * in this directory. There is no second parity decision pipeline.
 *
 * This module never re-implements engine mathematics. It defines the
 * normalized vocabulary that existing engine output is mapped onto.
 */
import type { MaturityState, Parity } from "@/lib/parity/engine-library/types";
import type { Tick } from "@/lib/analytics";

export type { MaturityState, Parity };

/** Direction an individual piece of evidence points at. */
export type ParityDirection = "EVEN" | "ODD" | "NEUTRAL";

/**
 * Engine families. Two engines in the same family are treated as
 * correlated observers of the same underlying phenomenon and are
 * de-duplicated before they can inflate confidence (§10).
 */
export type EngineFamily =
  | "STATISTICAL"
  | "STRUCTURAL"
  | "REGIME"
  | "PRESSURE"
  | "MOMENTUM"
  | "PATTERN"
  | "SEQUENCE"
  | "ANOMALY"
  | "CALIBRATION"
  | "RISK"
  | "TIMING"
  | "META"
  | "ENTRY_DIGIT"
  | "VALIDATION"
  | "ORCHESTRATION"
  | "INFRASTRUCTURE";

/**
 * What an engine is allowed to do to a cell.
 * DIRECT  — contributes directional evidence weight.
 * META    — modulates/validates other evidence, never votes on direction.
 * GATE    — may raise a hard veto (structural / governance authority).
 * CONTEXT — describes the environment (regime, timing) only.
 */
export type EngineAuthority = "DIRECT" | "META" | "GATE" | "CONTEXT";

export type SupportLevel = "SUPPORTING" | "MIXED" | "OPPOSING" | "UNKNOWN";

export interface EngineRole {
  readonly engine: string;
  readonly family: EngineFamily;
  readonly authority: EngineAuthority;
  /** Can this engine block admission on its own? */
  readonly canHardVeto: boolean;
  /** Can this engine contribute soft directional evidence? */
  readonly canSoftEvidence: boolean;
  /** Correlation family key — engines sharing it never double-count. */
  readonly correlationGroup: string;
  readonly stage: "EVIDENCE" | "META" | "GOVERNANCE" | "ENTRY" | "VALIDATION" | "FORMATTING";
  readonly description: string;
}

/** A hard, admission-blocking condition. Never averaged away. */
export interface HardVeto {
  readonly code: string;
  readonly engine: string;
  readonly reason: string;
  /** Which parity this veto applies to; null = both. */
  readonly parity: Parity | null;
}

/** A quality-reducing, non-fatal condition. */
export interface SoftBlocker {
  readonly code: string;
  readonly engine: string;
  readonly reason: string;
  /** 0..1 — how much cell quality is reduced. */
  readonly penalty: number;
  readonly parity: Parity | null;
}

/**
 * The single normalized evidence shape every engine adapter emits.
 * `raw` carries the untouched engine output so nothing is lost.
 */
export interface ParityEvidence {
  readonly engine: string;
  readonly family: EngineFamily;
  readonly authority: EngineAuthority;
  readonly correlationGroup: string;
  readonly direction: ParityDirection;
  /** 0..1 — how strongly the engine leans in `direction`. */
  readonly strength: number;
  /** 0..1 — the engine's own confidence in its read. */
  readonly confidence: number;
  /** 0..1 — how much sample backs the read. */
  readonly sampleAuthority: number;
  readonly detail: string;
  readonly metrics?: Readonly<Record<string, number>>;
  readonly raw?: unknown;
}

/** Environment evidence shared by both cells of a market. */
export interface ParityContextEvidence {
  readonly regime: string;
  readonly regimeStability: number; // 0..100
  readonly hiddenRegime: string;
  readonly regimeCompatible: Readonly<Record<Parity, boolean>>;
  readonly driftSeverity: "NONE" | "MINOR" | "MAJOR";
  readonly driftBreakDetected: boolean;
  readonly statisticalStrength: "STRONG" | "MODERATE" | "WEAK" | "INSUFFICIENT";
  readonly significant: boolean;
  readonly calibrationReliability: number; // 0..1
  readonly dangerScore: number; // 0..100
  readonly dangerCritical: boolean;
  readonly evPoint: number;
  readonly evLow: number;
  readonly evClears: boolean;
  readonly timing: string;
  readonly timingUrgency: "HIGH" | "MEDIUM" | "PATIENT";
  readonly entropy: number; // 0..1
  readonly changepoint: boolean;
  readonly multiHorizon: {
    readonly short: ParityDirection;
    readonly medium: ParityDirection;
    readonly long: ParityDirection;
    readonly agreementScore: number; // 0..100
    readonly alignment: "ALIGNED" | "PARTIAL" | "MIXED" | "CONTRADICTORY";
  };
  readonly decorrelation: {
    readonly rawVotes: number;
    readonly effectiveVotes: number;
    readonly inflationFactor: number;
    readonly confidencePenalty: number;
  };
  readonly feedQuality: number; // 0..100
  readonly feedHardVeto: boolean;
}

/** Canonical input to the whole subsystem. Supplied by the caller. */
export interface CanonicalParitySnapshot {
  readonly symbol: string;
  readonly displayName: string;
  readonly digits: readonly number[];
  readonly ticks: readonly Tick[];
  /** Monotonic identifier of the last tick used to produce this snapshot. */
  readonly sourceTickId: string;
  /** Bumped whenever the upstream analysis is recomputed. */
  readonly analysisVersion: number;
  readonly timestamp: number;
  readonly payoutRate?: number;
}

/** Identity of exactly one observation, used for exactly-once ingestion (§7). */
export interface ObservationIdentity {
  readonly marketId: string;
  readonly parity: Parity;
  readonly analysisVersion: number;
  readonly sourceTickId: string;
  readonly key: string;
}

export interface ContradictionRecord {
  readonly code: string;
  readonly kind: "HARD" | "SOFT";
  readonly detail: string;
  readonly atTick: number;
}

export interface CellEvidenceTrace {
  readonly engine: string;
  readonly family: EngineFamily;
  readonly relation: "SUPPORT" | "OPPOSE" | "NEUTRAL";
  readonly weight: number;
  readonly detail: string;
}

/** One observation delivered to one cell. */
export interface CellObservation {
  readonly identity: ObservationIdentity;
  readonly timestamp: number;
  /** Monotonic ordering value; out-of-order observations are ignored. */
  readonly sequence: number;
  readonly evidence: readonly ParityEvidence[];
  readonly context: ParityContextEvidence;
  readonly hardVetoes: readonly HardVeto[];
  readonly softBlockers: readonly SoftBlocker[];
}

export interface ParityCellSnapshot {
  readonly cellId: string;
  readonly marketId: string;
  readonly parity: Parity;
  readonly firstSeen: number;
  readonly lastUpdated: number;
  readonly observationCount: number;
  readonly persistenceTicks: number;
  readonly maturity: MaturityState;
  readonly confidence: number; // 0..100
  readonly supportScore: number; // 0..100
  readonly conflictScore: number; // 0..100
  readonly netEvidence: number; // -1..1
  readonly supportLevel: SupportLevel;
  readonly supportStreak: number;
  readonly cleanStreak: number;
  readonly contradictionStreak: number;
  readonly vetoStreak: number;
  readonly meaningfulEvidenceTicks: number;
  readonly engineAgreement: readonly string[];
  readonly engineDisagreement: readonly string[];
  readonly contradictions: readonly ContradictionRecord[];
  readonly evidenceTrace: readonly CellEvidenceTrace[];
  readonly hardVetoes: readonly HardVeto[];
  readonly softBlockers: readonly SoftBlocker[];
  readonly context: ParityContextEvidence | null;
  readonly regimeCompatible: boolean;
  readonly statisticalAuthority: number; // 0..1
  readonly history: readonly CellHistoryPoint[];
  readonly lastObservationKey: string | null;
  readonly duplicateObservations: number;
  readonly outOfOrderObservations: number;
}

export interface CellHistoryPoint {
  readonly sequence: number;
  readonly timestamp: number;
  readonly confidence: number;
  readonly netEvidence: number;
  readonly maturity: MaturityState;
  readonly hardVetoCount: number;
}

/** Serialized cell state — persistence is wired later, not now (§6). */
export interface SerializedCell {
  readonly cellId: string;
  readonly marketId: string;
  readonly parity: Parity;
  readonly state: unknown;
}

// ── Sentinel bridge (read-only) ────────────────────────────────────────────

/**
 * Read-only projection of a Sentinel observation dossier. The bridge accepts
 * this structural subset so it can never reach into or mutate Sentinel.
 */
export interface ReadonlySentinelProjection {
  readonly cellId: string;
  readonly marketId: string;
  readonly proposition: string;
  readonly state: string;
  readonly score: number;
  readonly isRipe: boolean;
  readonly hardVetoActive: boolean;
  readonly regimeCompatibility: "COMPATIBLE" | "NEUTRAL_UNCERTAIN" | "INCOMPATIBLE";
  readonly identity: {
    readonly winningDigits: readonly number[];
    readonly losingDigits: readonly number[];
    readonly greenParity: Parity;
    readonly secondGreenParity: Parity;
    readonly redParity: Parity;
    readonly extremeDigit: number;
    readonly redExcludedDigit: number;
    readonly edgeGroup: readonly number[];
  };
}

export type CrossConfirmationVerdict =
  | "CONFIRMS"
  | "PARTIAL"
  | "NEUTRAL"
  | "CONTRADICTS"
  | "UNAVAILABLE";

export interface CrossConfirmationResult {
  readonly proposition: string;
  readonly sentinelCellId: string;
  /** Parity implied by the actual winning-digit composition, never by contract name. */
  readonly impliedParity: ParityDirection;
  readonly impliedParityBasis: "WINNING_DIGIT_COMPOSITION" | "GREEN_PARITY_IDENTITY" | "NONE";
  readonly winningEvenCount: number;
  readonly winningOddCount: number;
  readonly parityTilt: number; // -1 (ODD) .. +1 (EVEN)
  readonly evenCellSupport: number; // 0..100
  readonly oddCellSupport: number; // 0..100
  readonly verdict: CrossConfirmationVerdict;
  readonly trend: "STRENGTHENING" | "WEAKENING" | "STABLE" | "UNKNOWN";
  readonly regimeCompatible: boolean;
  readonly countsAsConfirmation: boolean;
  readonly reasons: readonly string[];
}

// ── Entry digit + DBot ─────────────────────────────────────────────────────

export interface EntryDigitReadiness {
  readonly evaluated: boolean;
  readonly reason: string;
  readonly targetContract: "DIGITEVEN" | "DIGITODD" | null;
  readonly entryDigit: number | null;
  readonly confidence: number;
  readonly status: string | null;
  readonly raw?: unknown;
}

export interface ReplayValidationRequest {
  readonly digits: readonly number[];
  readonly entryDigit: number;
  readonly targetParity: Parity;
  /** Fraction of history held out for out-of-sample replay (0.1..0.5). */
  readonly oosFraction?: number;
}

export interface ReplayTrade {
  readonly openingIndex: number;
  readonly settlementIndex: number;
  readonly entryDigit: number;
  readonly settlementDigit: number;
  readonly win: boolean;
}

export interface ReplayValidationResult {
  readonly entryDigit: number;
  readonly targetParity: Parity;
  readonly trades: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly longestWinStreak: number;
  readonly longestLossStreak: number;
  readonly outOfSample: { readonly trades: number; readonly wins: number; readonly winRate: number };
  readonly validated: boolean;
  readonly reason: string;
  readonly trades_: readonly ReplayTrade[];
}

export interface EntryDigitReplayValidator {
  readonly id: string;
  validate(request: ReplayValidationRequest): ReplayValidationResult;
}

// ── Final snapshot ─────────────────────────────────────────────────────────

export type QualificationState =
  | "NO_VALID_SETUP"
  | "DEVELOPING"
  | "CANDIDATE"
  | "QUALIFIED"
  | "BLOCKED";

export type AdmissionState = "ADMITTED" | "NOT_ADMITTED";

export interface CellRanking {
  readonly parity: Parity;
  readonly rank: 1 | 2;
  readonly strength: number; // 0..100 — ranking is strength only, never validity
  readonly blocked: boolean;
}

export interface ParityIntelligenceSnapshot {
  readonly timestamp: number;
  readonly market: { readonly symbol: string; readonly displayName: string };
  readonly source: {
    readonly sourceTickId: string;
    readonly analysisVersion: number;
    readonly digitCount: number;
  };
  readonly even: ParityCellSnapshot;
  readonly odd: ParityCellSnapshot;
  readonly strongestCell: Parity | null;
  readonly ranking: readonly CellRanking[];
  readonly evidence: readonly ParityEvidence[];
  readonly context: ParityContextEvidence;
  readonly contradictions: readonly ContradictionRecord[];
  readonly crossConfirmation: readonly CrossConfirmationResult[];
  readonly entryDigit: EntryDigitReadiness;
  readonly dbot: ReplayValidationResult | null;
  readonly hardVetoes: readonly HardVeto[];
  readonly softBlockers: readonly SoftBlocker[];
  readonly qualification: QualificationState;
  readonly admission: AdmissionState;
  readonly reasoning: readonly string[];
}
