import type { ParityEvidence, HardVeto, SoftBlocker, ParityCellSnapshot as OldCell } from "./evidence/types";
import type { CellIdentity, CellStage, MaturitySnapshot, Parity30CellSnapshot, SuitabilityBreakdown, Parity } from "./types";
import type { MarketIntelligence } from "./market-intelligence";
import { ParityEnsembleLearner } from "./engine-library/engines/ensemble-engine";
import type { ParityPsychologySnapshot, MutableParityPsychologyState } from "./psychology/types";
import { emptyMaturityThesisState, type MutableMaturityThesisState } from "./maturity-thesis";

const clamp = (n: number, a = 0, b = 100) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : 0));

export function cellIdFor(marketId: string, parity: Parity) {
  return `${marketId}:${parity}`;
}

function maturityStage(state: MutableParity30State, parity: Parity): CellStage {
  const elapsedMs = state.firstSeen > 0 && state.lastUpdated > 0 ? state.lastUpdated - state.firstSeen : 0;

  if (state.hardBlocks.length && state.contradictionStreak >= 3) return "REJECTED";

  // Maturity is an earned thesis, not a recent-window classification. Once a
  // thesis is earned it remains MATURE until sustained failure erodes it.
  if (state.maturityThesis.failureStreak >= 12 && state.maturityThesis.matureSince !== null) return "DECAYING";
  if (state.maturityThesis.matureSince !== null) {

    const ready =
      state.hardBlocks.length === 0 &&
      state.admissionBlocks.length === 0 &&
      state.suitability >= 72 &&
      state.maturityThesisSnapshot.qualifiedNow &&
      state.maturityThesis.qualifyingStreak >= 8 &&
      state.adverseStreak < 3;
    return ready ? "READY" : "MATURE";
  }

  if (state.observations < 20 || elapsedMs < 15_000) return "WATCHING";
  if (state.maturityThesisSnapshot.coherent || state.maturityThesis.score >= 45) return "DEVELOPING";
  return "DEVELOPING";
}

export interface MutableParity30State {
  firstSeen: number;
  lastUpdated: number;
  observations: number;
  persistenceTicks: number;
  supportStreak: number;
  cleanStreak: number;
  contradictionStreak: number;
  supportiveObservations: number;
  adverseObservations: number;
  maturitySince: number | null;
  readySince: number | null;
  adverseStreak: number;
  recentNetEvidence: number[];
  recentSuitability: number[];
  recentClean: boolean[];
  suitability: number;
  confidence: number;
  netEvidence: number;
  supportScore: number;
  conflictScore: number;
  sentinelSupport: number;
  intelligenceQuality: number;
  marketMechanism: string;
  marketWhy: string[];
  trace: Parity30CellSnapshot["evidenceTrace"];
  supportingEngines: string[];
  opposingEngines: string[];
  hardBlocks: string[];
  softWarnings: string[];
  entryDigit: number | null;
  entryReady: boolean;
  dbotValidated: boolean | null;
  probability: import("./probability").ParityProbabilityReport | null;
  admissionBlocks: string[];
  psychology: ParityPsychologySnapshot | null;
  psychologyState: MutableParityPsychologyState;
  maturityThesis: MutableMaturityThesisState;
  maturityThesisSnapshot: import("./maturity-thesis").MaturityThesisSnapshot;
}

export function emptyCellState(now = Date.now()): MutableParity30State {
  return {
    firstSeen: 0,
    lastUpdated: 0,
    observations: 0,
    persistenceTicks: 0,
    supportStreak: 0,
    cleanStreak: 0,
    contradictionStreak: 0,
    supportiveObservations: 0,
    adverseObservations: 0,
    maturitySince: null,
    readySince: null,
    adverseStreak: 0,
    recentNetEvidence: [],
    recentSuitability: [],
    recentClean: [],
    suitability: 0,
    confidence: 0,
    netEvidence: 0,
    supportScore: 0,
    conflictScore: 0,
    sentinelSupport: 0,
    intelligenceQuality: 0,
    marketMechanism: "No mechanism read yet.",
    marketWhy: [],
    trace: [],
    supportingEngines: [],
    opposingEngines: [],
    hardBlocks: [],
    softWarnings: [],
    entryDigit: null,
    entryReady: false,
    dbotValidated: null,
    probability: null,
    admissionBlocks: [],
    psychology: null,
    psychologyState: {
      lastParity: null,
      stableTicks: 0,
      adverseTicks: 0,
      supportiveTicks: 0,
      matureScore: 0,
      lastHealth: 50,
      history: [],
    },
    maturityThesis: emptyMaturityThesisState(),
    maturityThesisSnapshot: {
      score: 0, coherent: false, qualifiedNow: false, independentFamilies: 0, dimensions: [], coherence: 0, persistence: 0, contradiction: 0, psychologyHealth: 0, statisticalConfidence: 0, thesisAgeMs: 0, qualifyingStreak: 0, failureStreak: 0, lastQualifiedAt: null, reasons: [], warnings: [],
    },
  };
}

export function updateCell(
  state: MutableParity30State,
  parity: Parity,
  evidence: readonly ParityEvidence[],
  hardVetoes: readonly HardVeto[],
  softBlockers: readonly SoftBlocker[],
  context: { marketId?: string; regimeCompatible: boolean; statisticalAuthority: number; dangerScore: number; feedQuality: number },
  sentinelSupport: number,
  now: number,
  intelligence?: MarketIntelligence,
  psychology?: ParityPsychologySnapshot,
) {
  const directional = evidence.filter((e) => e.authority === "DIRECT" || e.authority === "META");
  let support = 0;
  let oppose = 0;
  const trace: Array<{ engine: string; relation: "SUPPORT" | "OPPOSE" | "NEUTRAL"; weight: number; detail: string }> = [];
  const supporters: string[] = [];
  const opponents: string[] = [];
  const groups = new Map<string, { weight: number; engine: string; relation: "SUPPORT" | "OPPOSE" | "NEUTRAL"; detail: string }>();

  for (const e of directional) {
    const relation = e.direction === parity ? "SUPPORT" : e.direction === "NEUTRAL" ? "NEUTRAL" : "OPPOSE";
    const reliability = context.marketId
      ? ParityEnsembleLearner.get().getEngineWeight(context.marketId, e.engine, 1)
      : 1;
    const base = clamp((e.strength * e.confidence * Math.max(0.25, e.sampleAuthority) * reliability) * 100, 0, 100);
    const prior = groups.get(e.correlationGroup);
    if (!prior || base > prior.weight) groups.set(e.correlationGroup, { weight: base, engine: e.engine, relation, detail: e.detail });
  }

  for (const g of groups.values()) {
    const w = g.weight;
    trace.push({ engine: g.engine, relation: g.relation, weight: w, detail: g.detail });
    if (g.relation === "SUPPORT") { support += w; supporters.push(g.engine); }
    else if (g.relation === "OPPOSE") { oppose += w; opponents.push(g.engine); }
  }

  const total = Math.max(1, support + oppose);
  const directionalNet = (support - oppose) / total;
  const evidenceScore = clamp(50 + directionalNet * 50);
  const statistical = clamp(context.statisticalAuthority * 100);
  const regime = context.regimeCompatible ? 100 : 20;
  const danger = clamp(100 - context.dangerScore * 0.8);
  const psychologyScore = clamp(psychology?.chiefScore ?? sentinelSupport);
  const intelligenceQuality = clamp((intelligence?.quality ?? 0) * 100);
  const directionMechanism = intelligence ? (parity === "EVEN" ? intelligence.parity.evenShare : intelligence.parity.oddShare) : 0.5;
  const mechanismEdge = clamp(Math.abs(directionMechanism - 0.5) * 200);
  const persistence = clamp(Math.min(100, state.persistenceTicks * 7));
  const freshness = 100;

  const suitabilityBreakdown: SuitabilityBreakdown = {
    evidence: evidenceScore,
    psychology: psychologyScore,
    persistence,
    regime,
    statistical,
    danger,
    freshness,
  };

  // Suitability is a current-state measure. It may move quickly.
  state.suitability = clamp(
    evidenceScore * 0.15 + psychologyScore * 0.50 + statistical * 0.06 + regime * 0.06 + danger * 0.06 + persistence * 0.04 + intelligenceQuality * 0.06 + mechanismEdge * 0.04 + freshness * 0.03,
  );

  const positive = support > oppose && directionalNet > 0.04;
  const clean = hardVetoes.filter((v) => v.parity === null || v.parity === parity).length === 0;
  if (positive) {
    state.supportStreak += 1;
    state.adverseStreak = 0;
    state.persistenceTicks += 1;
  } else {
    state.supportStreak = 0;
    state.adverseStreak = oppose > support ? state.adverseStreak + 1 : state.adverseStreak;
    // Persistence decays slowly. A single contrary tick cannot erase a
    // mature observation history.
    if (state.adverseStreak >= 3) state.persistenceTicks = Math.max(0, state.persistenceTicks - 1);
  }
  if (clean) state.cleanStreak += 1; else state.cleanStreak = 0;
  if (!positive && oppose > support) state.contradictionStreak += 1; else state.contradictionStreak = 0;

  if (state.firstSeen === 0) state.firstSeen = now;
  state.observations += 1;
  state.lastUpdated = now;
  state.netEvidence = directionalNet;
  state.recentNetEvidence.push(directionalNet);
  state.recentSuitability.push(state.suitability);
  state.recentClean.push(clean);
  if (state.recentNetEvidence.length > 30) state.recentNetEvidence.shift();
  if (state.recentSuitability.length > 30) state.recentSuitability.shift();
  if (state.recentClean.length > 30) state.recentClean.shift();
  if (positive) state.supportiveObservations += 1;
  else if (oppose > support) state.adverseObservations += 1;
  state.supportScore = clamp(support / Math.max(1, groups.size) * 1.2);
  state.conflictScore = clamp(oppose / Math.max(1, groups.size) * 1.2);
  state.confidence = clamp(state.suitability * 0.65 + Math.min(35, state.observations / 8));
  state.sentinelSupport = clamp(sentinelSupport);
  state.intelligenceQuality = intelligence ? clamp(intelligence.quality * 100) : state.intelligenceQuality;
  if (psychology) {
    const sideHealth = psychology.chiefParity === parity
      ? psychology.chiefHealth
      : psychology.chiefParity === "BALANCED"
        ? 50
        : 100 - psychology.chiefHealth;
    state.psychology = psychology;
    state.psychologyState = {
      ...state.psychologyState,
      lastParity: psychology.chiefParity === "BALANCED" ? state.psychologyState.lastParity : psychology.chiefParity,
      stableTicks: psychology.chiefParity !== "BALANCED" && psychology.chiefParity === state.psychologyState.lastParity
        ? state.psychologyState.stableTicks + 1
        : Math.max(0, state.psychologyState.stableTicks - 1),
      adverseTicks: psychology.chiefParity === parity && psychology.reversalRisk < 55
        ? 0
        : state.psychologyState.adverseTicks + 1,
      supportiveTicks: psychology.chiefParity === parity && psychology.chiefHealth >= 60
        ? state.psychologyState.supportiveTicks + 1
        : Math.max(0, state.psychologyState.supportiveTicks - 1),
      matureScore: Math.max(state.psychologyState.matureScore, sideHealth),
      lastHealth: sideHealth,
      history: [...state.psychologyState.history, sideHealth].slice(-60),
    };
  }
  state.marketMechanism = intelligence?.mechanism ?? state.marketMechanism;
  state.marketWhy = intelligence ? [...intelligence.why] : state.marketWhy;
  state.trace = trace.sort((a, b) => b.weight - a.weight).slice(0, 20);
  state.supportingEngines = supporters;
  state.opposingEngines = opponents;
  state.hardBlocks = hardVetoes.filter((v) => v.parity === null || v.parity === parity).map((v) => `${v.code}: ${v.reason}`);
  state.softWarnings = softBlockers.filter((b) => b.parity === null || b.parity === parity).map((b) => `${b.code}: ${b.reason}`);
  return suitabilityBreakdown;
}

export function snapshotCell(identity: CellIdentity, state: MutableParity30State, breakdown: SuitabilityBreakdown): Parity30CellSnapshot {
  const stage = maturityStage(state, identity.parity);
  // Execution state is subordinate to the cell lifecycle. A cell that falls
  // back from READY to MATURE/DECAYING keeps its analytical history, but its
  // previous entry/replay result is no longer actionable.
  if (stage !== "READY") {
    state.entryReady = false;
    state.entryDigit = null;
    state.dbotValidated = null;
  }
  const elapsedMs = state.firstSeen > 0 && state.lastUpdated > 0 ? state.lastUpdated - state.firstSeen : 0;
  const maturity: MaturitySnapshot = {
    score: state.maturityThesis.score,
    observations: state.observations,
    persistenceTicks: state.persistenceTicks,
    supportStreak: state.supportStreak,
    cleanStreak: state.cleanStreak,
    contradictionStreak: state.contradictionStreak,
    supportiveObservations: state.supportiveObservations,
    adverseObservations: state.adverseObservations,
    ageMs: elapsedMs,
    maturitySince: state.maturityThesis.matureSince,
    thesis: state.maturityThesisSnapshot,
    stage,
  };
  return Object.freeze({
    identity,
    firstSeen: state.firstSeen,
    lastUpdated: state.lastUpdated,
    suitability: state.suitability,
    suitabilityBreakdown: breakdown,
    confidence: state.confidence,
    maturity,
    netEvidence: state.netEvidence,
    supportScore: state.supportScore,
    conflictScore: state.conflictScore,
    supportingEngines: Object.freeze([...state.supportingEngines]),
    opposingEngines: Object.freeze([...state.opposingEngines]),
    hardBlocks: Object.freeze([...state.hardBlocks]),
    softWarnings: Object.freeze([...state.softWarnings]),
    entryDigit: state.entryDigit,
    entryReady: state.entryReady,
    dbotValidated: state.dbotValidated,
    probability: state.probability,
    admissionBlocks: Object.freeze([...state.admissionBlocks]),
    sentinelSupport: state.sentinelSupport,
    intelligenceQuality: state.intelligenceQuality ?? 0,
    marketMechanism: state.marketMechanism ?? "No mechanism read yet.",
    marketWhy: Object.freeze([...(state.marketWhy ?? [])]),
    psychology: state.psychology,
    evidenceTrace: Object.freeze([...state.trace]),
  });
}
