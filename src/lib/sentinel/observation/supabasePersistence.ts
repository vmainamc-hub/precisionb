import type { CellId } from "./constants";
import type { ObservationDossier, ObservationEvent, QualificationSnapshot } from "./types";
import type { ObservationPersistenceAdapter } from "./persistence";
import { supabase } from "@/integrations/supabase/client";
import { safeStorage, safeJsonParse } from "@/lib/storage-fallback";

const LOCAL_STORAGE_KEY = "apex.observation.persistence.v1";
const MAX_STORED_EVENTS_PER_CELL = 20;
const MAX_TOTAL_EVENTS = 300;
const MAX_QUALIFICATIONS = 50;
const DEBOUNCE_SAVE_MS = 2000;
const SUPABASE_THROTTLE_MS = 15_000;

interface LocalStore {
  dossiers: Record<string, ObservationDossier>;
  events: Record<string, ObservationEvent[]>;
  qualifications: Record<string, QualificationSnapshot>;
  updatedAt: number;
}

/**
 * Compacts an ObservationDossier for persistence by retaining all fields required
 * for hydration, scoring, and UI rendering while stripping heavy circular / nested engine payloads.
 */
function compactDossierForStorage(dossier: ObservationDossier): ObservationDossier {
  return {
    cellId: dossier.cellId,
    marketId: dossier.marketId,
    proposition: dossier.proposition,
    state: dossier.state,
    score: dossier.score,
    isRipe: dossier.isRipe,
    factors: dossier.factors?.slice(0, 5),
    observationAge: dossier.observationAge,
    currentStateSince: dossier.currentStateSince,
    stability: dossier.stability,
    psychology: dossier.psychology,
    entryDigit: dossier.entryDigit,
    pressure: dossier.pressure,
    losingSidePressure: dossier.losingSidePressure,
    liquiditySweep: dossier.liquiditySweep,
    danger: dossier.danger,
    simulation: dossier.simulation,
    regime: dossier.regime,
    momentum: dossier.momentum,
    momentumRelation: dossier.momentumRelation,
    trigger: dossier.trigger,
    veto: dossier.veto,
    statistics: dossier.statistics,
    hiddenBehavior: dossier.hiddenBehavior,
    contradictions: dossier.contradictions,
    supportingEvidence: dossier.supportingEvidence?.slice(0, 5) ?? [],
    opposingEvidence: dossier.opposingEvidence?.slice(0, 5) ?? [],
    formationVelocity: dossier.formationVelocity,
    evidenceMaturity: dossier.evidenceMaturity,
    tickConfirmation: dossier.tickConfirmation,
    assessment: dossier.assessment,
    thesis: dossier.thesis ? { ...dossier.thesis } : undefined,
    validityWindow: dossier.validityWindow,
    qualityBand: dossier.qualityBand,
    executionReady: dossier.executionReady,
    executionReadyReasons: dossier.executionReadyReasons?.slice(0, 3),
    feedbackLearning: dossier.feedbackLearning
      ? {
          ...dossier.feedbackLearning,
          history: dossier.feedbackLearning.history?.slice(0, 5) ?? [],
        }
      : undefined,
  };
}

export class SupabasePersistenceAdapter implements ObservationPersistenceAdapter {
  private memoryStore: LocalStore = {
    dossiers: {},
    events: {},
    qualifications: {},
    updatedAt: Date.now(),
  };
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSupabaseSync = new Map<string, number>();
  private cachedUserId: string | null = null;
  private lastAuthCheckAt = 0;

  constructor() {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage() {
    try {
      const raw = safeStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = safeJsonParse<LocalStore | null>(raw, null);
        if (parsed && typeof parsed === "object") {
          this.memoryStore = {
            dossiers: parsed.dossiers ?? {},
            events: parsed.events ?? {},
            qualifications: parsed.qualifications ?? {},
            updatedAt: parsed.updatedAt ?? Date.now(),
          };
        }
      }
    } catch {
      // Clean fallback
    }
  }

  private scheduleLocalSave() {
    if (this.saveDebounceTimer) return;
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null;
      try {
        safeStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.memoryStore));
      } catch {
        // Handled gracefully by safeStorage
      }
    }, DEBOUNCE_SAVE_MS);
  }

  private async getAuthUserId(): Promise<string | null> {
    const now = Date.now();
    // Cache auth check for 30 seconds to avoid spamming the network on each tick
    if (now - this.lastAuthCheckAt < 30_000) {
      return this.cachedUserId;
    }
    this.lastAuthCheckAt = now;
    try {
      const { data: authData } = await supabase.auth.getUser();
      this.cachedUserId = authData?.user?.id ?? null;
      return this.cachedUserId;
    } catch {
      this.cachedUserId = null;
      return null;
    }
  }

  async saveDossierSnapshot(dossier: ObservationDossier): Promise<void> {
    const compacted = compactDossierForStorage(dossier);
    this.memoryStore.dossiers[dossier.cellId] = compacted;
    this.memoryStore.updatedAt = Date.now();
    this.scheduleLocalSave();

    // Asynchronously mirror high-value states (RIPE/CONFIRMING) to Supabase with rate-limiting
    if (dossier.state === "RIPE" || dossier.state === "CONFIRMING") {
      const now = Date.now();
      const lastSync = this.lastSupabaseSync.get(dossier.cellId) ?? 0;
      if (now - lastSync < SUPABASE_THROTTLE_MS) {
        return;
      }
      this.lastSupabaseSync.set(dossier.cellId, now);

      try {
        const userId = await this.getAuthUserId();
        if (userId) {
          await supabase.from("apex_market_state").upsert(
            {
              symbol: dossier.marketId,
              user_id: userId,
              kind: `obs_dossier_${dossier.cellId}`,
              model_version: 1,
              payload: compacted as unknown as never,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "symbol,kind,user_id" },
          );
        }
      } catch {
        // Non-blocking background sync
      }
    }
  }

  async loadDossier(cellId: CellId): Promise<ObservationDossier | null> {
    return this.memoryStore.dossiers[cellId] ?? null;
  }

  async loadAllDossiers(): Promise<Record<string, ObservationDossier>> {
    return { ...this.memoryStore.dossiers };
  }

  async appendEvent(cellId: CellId, event: ObservationEvent): Promise<void> {
    if (!this.memoryStore.events[cellId]) {
      this.memoryStore.events[cellId] = [];
    }
    const list = this.memoryStore.events[cellId];
    list.push(event);
    if (list.length > MAX_STORED_EVENTS_PER_CELL) {
      list.splice(0, list.length - MAX_STORED_EVENTS_PER_CELL);
    }

    // Prune total event count if necessary
    let totalEvents = 0;
    for (const key in this.memoryStore.events) {
      totalEvents += this.memoryStore.events[key].length;
    }
    if (totalEvents > MAX_TOTAL_EVENTS) {
      for (const key in this.memoryStore.events) {
        if (this.memoryStore.events[key].length > 5) {
          this.memoryStore.events[key].splice(0, this.memoryStore.events[key].length - 5);
        }
      }
    }

    this.memoryStore.updatedAt = Date.now();
    this.scheduleLocalSave();
  }

  async loadRecentEvents(cellId: CellId, limit = 20): Promise<ObservationEvent[]> {
    const list = this.memoryStore.events[cellId] ?? [];
    return list.slice(-limit);
  }

  async saveQualification(snapshot: QualificationSnapshot): Promise<void> {
    this.memoryStore.qualifications[snapshot.cellId] = snapshot;
    // Bounded qualifications map
    const qualKeys = Object.keys(this.memoryStore.qualifications);
    if (qualKeys.length > MAX_QUALIFICATIONS) {
      for (let i = 0; i < qualKeys.length - MAX_QUALIFICATIONS; i++) {
        delete this.memoryStore.qualifications[qualKeys[i]];
      }
    }

    this.memoryStore.updatedAt = Date.now();
    this.scheduleLocalSave();

    // Mirror qualification snapshot to Supabase with rate-limiting
    const now = Date.now();
    const lastSync = this.lastSupabaseSync.get(`qual_${snapshot.cellId}`) ?? 0;
    if (now - lastSync < SUPABASE_THROTTLE_MS) {
      return;
    }
    this.lastSupabaseSync.set(`qual_${snapshot.cellId}`, now);

    try {
      const userId = await this.getAuthUserId();
      if (userId) {
        await supabase.from("apex_market_state").upsert(
          {
            symbol: snapshot.marketId,
            user_id: userId,
            kind: `obs_qual_${snapshot.cellId}`,
            model_version: 1,
            payload: snapshot as unknown as never,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "symbol,kind,user_id" },
        );
      }
    } catch {
      // Non-blocking sync
    }
  }

  async loadQualification(cellId: CellId): Promise<QualificationSnapshot | null> {
    return this.memoryStore.qualifications[cellId] ?? null;
  }
}

