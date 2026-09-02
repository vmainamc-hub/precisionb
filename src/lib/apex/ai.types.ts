// APEX SENTINEL — AI brief schema and reasoning types (client-safe).
// Kept out of ai.server.ts so route/component code can import the types
// without pulling the provider client into the browser bundle.
import { z } from "zod";

const evidenceSchema = z.object({
  engine: z.string(),
  label: z.string(),
  detail: z.string(),
  weight: z.number(),
  n: z.number(),
});

export const briefSchema = z.object({
  symbol: z.string(),
  market: z.string(),
  contract: z.string(),
  opportunity: z.number(),
  confidence: z.number(),
  edgePct: z.number(),
  edgeLowerBoundPct: z.number(),
  quality: z.number(),
  stability: z.number(),
  freshness: z.number(),
  danger: z.number(),
  contradiction: z.number(),
  phase: z.string(),
  regime: z.string(),
  sampleTicks: z.number(),
  empiricalWinPct: z.number(),
  theoreticalWinPct: z.number(),
  supports: z.array(evidenceSchema),
  conflicts: z.array(evidenceSchema),
  runnerUps: z.array(z.object({ market: z.string(), contract: z.string(), score: z.number() })),
  globalDanger: z.number(),

  // ---- Refinement evidence ----
  adjustedWinPct: z.number(),
  winRateIntervalPct: z.tuple([z.number(), z.number()]),
  rateConfidence: z.string(),
  evidenceGrade: z.string(),
  statisticalNotes: z.array(z.string()),
  losingDigits: z.array(z.number()),
  losingDigitThreats: z.array(
    z.object({
      digit: z.number(),
      score: z.number(),
      state: z.string(),
      drivers: z.array(z.string()),
    }),
  ),
  groupThreat: z.number(),
  threatState: z.string(),
  recurrence: z.string(),
  pressureAsymmetry: z.number(),
  criticalConflicts: z.array(z.string()),
  criticalDetail: z.string(),
  barStructure: z.string(),
  increasingDigits: z.array(z.number()),
  decreasingDigits: z.array(z.number()),
  models: z.array(
    z.object({
      label: z.string(),
      status: z.string(),
      probabilityPct: z.number(),
      oosAccuracyPct: z.number(),
      baseRatePct: z.number(),
      testN: z.number(),
      note: z.string(),
    }),
  ),
  modelAgreement: z.number(),
  modelDisagreement: z.string(),
  forwardState: z.object({
    direction: z.string(),
    uncertainty: z.number(),
    horizonTicks: z.number(),
    statement: z.string(),
    risk: z.string(),
    analogueSupport: z.string(),
  }),
  fakeEdgeFailures: z.array(z.string()),
  fakeEdgeVerdict: z.string(),
  battle: z.string(),
  historicalAnalogue: z.string(),
});

export type ApexBrief = z.infer<typeof briefSchema>;

export interface ApexReasoning {
  analyst: string;
  devilsAdvocate: string;
  chief: string;
  available: boolean;
  error?: string;
}
