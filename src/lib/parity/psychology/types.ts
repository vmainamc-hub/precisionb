import type { Parity } from "../types";

export type PsychologyHealth =
  | "HEALTHY"
  | "REINFORCED"
  | "STABLE"
  | "WEAKENING"
  | "TRANSITIONING"
  | "EXHAUSTED"
  | "REVERSING"
  | "OPPOSED";

export type PsychologySupportQuality =
  | "DISTRIBUTED"
  | "REINFORCED"
  | "CONCENTRATED"
  | "FRAGILE"
  | "EXHAUSTED"
  | "RECOVERING"
  | "TRANSITIONING";

export type PsychologyState =
  | "WATCHING"
  | "DEVELOPING"
  | "MATURE"
  | "READY"
  | "TRANSITIONING"
  | "EXHAUSTED"
  | "REVERSING";

export interface PsychologyDigitRole {
  readonly digit: number;
  readonly parity: Parity;
  readonly share: number;
  readonly velocity: number;
  readonly acceleration: number;
  readonly activity: number;
}

export interface ParityPsychologyRoles {
  readonly green: PsychologyDigitRole;
  readonly secondGreen: PsychologyDigitRole;
  readonly red: PsychologyDigitRole;
  readonly secondRed: PsychologyDigitRole;
  readonly mostIncreasing: PsychologyDigitRole;
  readonly mostDecreasing: PsychologyDigitRole;
}

export interface ParityPsychologySide {
  readonly parity: Parity;
  readonly score: number;
  readonly alignment: number;
  readonly structuralSupport: number;
  readonly momentumSupport: number;
  readonly specialDigitActivity: number;
  readonly opposingPressure: number;
  readonly exhaustion: number;
  readonly recovery: number;
  readonly continuationLikelihood: number;
  readonly reversalLikelihood: number;
  readonly psychologicalHealth: number;
  readonly health: PsychologyHealth;
  readonly supportQuality: PsychologySupportQuality;
  readonly strongestSupport: string;
  readonly strongestThreat: string;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly roles: ParityPsychologyRoles;
}

export interface ParityPsychologySnapshot {
  readonly marketId: string;
  readonly timestamp: number;
  readonly sampleSize: number;
  readonly roles: ParityPsychologyRoles;
  readonly even: ParityPsychologySide;
  readonly odd: ParityPsychologySide;
  readonly chiefParity: Parity | "BALANCED";
  readonly chiefScore: number;
  readonly chiefHealth: number;
  readonly reversalRisk: number;
  readonly transitionRisk: number;
  readonly thesis: string;
  readonly why: readonly string[];
  readonly warnings: readonly string[];
  readonly readyEligible: boolean;
}

export interface MutableParityPsychologyState {
  lastParity: Parity | null;
  stableTicks: number;
  adverseTicks: number;
  supportiveTicks: number;
  matureScore: number;
  lastHealth: number;
  history: number[];
}

export interface PsychologyUpdate {
  readonly snapshot: ParityPsychologySnapshot;
  readonly state: MutableParityPsychologyState;
}
