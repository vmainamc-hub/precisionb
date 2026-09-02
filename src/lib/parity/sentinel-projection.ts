import type { ObservationDossier } from "@/lib/sentinel/observation/types";
import type { CellIdentity } from "@/lib/sentinel/observation/cellIdentity";

export type ProjectableDossier = Pick<ObservationDossier, "cellId" | "marketId" | "proposition" | "state" | "score" | "isRipe"> & {
  identity?: CellIdentity;
  regime?: { compatibility?: ObservationDossier["regime"]["compatibility"] };
  veto?: { active?: boolean; hard?: boolean };
  psychology?: { raw?: { canonicalState?: {
    pct?: number[];
    recentPct?: number[];
    deltaPp?: number[];
    green?: number | null;
    secondGreen?: number | null;
    red?: number | null;
    secondRed?: number | null;
    mostIncreasing?: number | null;
    mostDecreasing?: number | null;
    change?: string;
  } } };
  momentum?: { directional?: { relativeMomentum?: number; reversal?: boolean; takeoverRisk?: boolean } | null };
};

export function projectSentinelDossier(dossier: ProjectableDossier) {
  if (!dossier.identity) return null;
  return Object.freeze({
    cellId: String(dossier.cellId),
    marketId: String(dossier.marketId),
    proposition: String(dossier.proposition),
    state: String(dossier.state),
    score: Number(dossier.score) || 0,
    isRipe: Boolean(dossier.isRipe),
    hardVetoActive: Boolean(dossier.veto?.active && dossier.veto?.hard),
    canonicalPsychology: dossier.psychology?.raw?.canonicalState ? Object.freeze({
      green: dossier.psychology.raw.canonicalState.green ?? null,
      secondGreen: dossier.psychology.raw.canonicalState.secondGreen ?? null,
      red: dossier.psychology.raw.canonicalState.red ?? null,
      secondRed: dossier.psychology.raw.canonicalState.secondRed ?? null,
      mostIncreasing: dossier.psychology.raw.canonicalState.mostIncreasing ?? null,
      mostDecreasing: dossier.psychology.raw.canonicalState.mostDecreasing ?? null,
      change: dossier.psychology.raw.canonicalState.change ?? "UNKNOWN",
    }) : null,
    regimeCompatibility: dossier.regime?.compatibility ?? "NEUTRAL_UNCERTAIN",
    identity: Object.freeze({
      winningDigits: Object.freeze([...dossier.identity.winningDigits]),
      losingDigits: Object.freeze([...dossier.identity.losingDigits]),
      greenParity: dossier.identity.greenParity,
      secondGreenParity: dossier.identity.secondGreenParity,
      redParity: dossier.identity.redParity,
      extremeDigit: dossier.identity.extremeDigit,
      redExcludedDigit: dossier.identity.redExcludedDigit,
      edgeGroup: Object.freeze([...dossier.identity.edgeGroup]),
    }),
  });
}
