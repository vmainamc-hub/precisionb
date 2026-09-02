import { useState, type RefObject } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Flame,
  Shield,
  Zap,
  Activity,
  Layers,
  Clock,
  Crosshair,
  TrendingUp,
  TrendingDown,
  Gauge,
  BarChart3,
  Cpu,
  Fingerprint,
  Info,
} from "lucide-react";
import type { RankedOpportunity, BestOf90Result, BestOf90Status } from "@/lib/apex/types";
import { operatorSurfaceGate } from "@/lib/apex/operator-surface-gate";
import { ScoreRing, MetricBar } from "@/components/apex/ScoreRing";
import { SectionTitle } from "@/components/apex/EvidencePanel";
import TradeFeedback from "@/components/apex/TradeFeedback";
import { CanonicalAlertBanner } from "@/components/apex/OpportunityAlert";
import type { OpportunityAlertsState } from "@/hooks/useOpportunityAlerts";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface BestOpportunityCardProps {
  item: RankedOpportunity;
  bestOf90?: BestOf90Result | null;
  alerts: OpportunityAlertsState;
  cardRef?: RefObject<HTMLDivElement | null>;
  focused?: boolean;
  alertStale?: boolean;
}

export function BestOpportunityCard({
  item,
  bestOf90,
  alerts,
  cardRef,
  focused,
  alertStale,
}: BestOpportunityCardProps) {
  const [copied, setCopied] = useState(false);
  const c = item.contract;
  const sim = item.simulator;
  const simWins = sim && sim.n ? Math.round(sim.winRate * sim.n) : 0;
  const ep = item.entryPoint;
  const d = ep?.preferred ?? null;
  const waitForEntry = item.signal?.waitForEntry ?? !d;
  // Stage 6 of the entry hierarchy: only a DBot-replay validated digit is shown.
  // Never invent a fallback digit — say so explicitly instead.
  const entryDigitText = d && !waitForEntry ? String(d.digit) : d ? "WAIT" : "NO VALIDATED ENTRY DIGIT";


  const gate = operatorSurfaceGate(item, item.intel);
  const isExecutionReady = Boolean(item.executionReady);

  // The underlying Best-of-90 record is still authoritative for the original
  // finalRank[0]. When the operator surface selects a later ranked survivor,
  // never leak the original candidate's status into the surfaced card.
  const bestOf90MatchesItem =
    !!bestOf90 && `${bestOf90.candidate.symbol}|${bestOf90.candidate.contract.id}` === `${item.symbol}|${item.contract.id}`;
  const status: BestOf90Status =
    (bestOf90MatchesItem ? bestOf90?.status : null) ??
    (!gate.qualified
      ? item.blocked || item.contract.danger > 45 || gate.blockers.some((b) => b.includes("DANGER"))
        ? "BEST OF 90 — BLOCKED"
        : item.nearSignal?.isNearSignal
          ? "BEST OF 90 — NEAR-SIGNAL"
          : "BEST OF 90 — NOT QUALIFIED"
      : isExecutionReady
        ? "BEST OF 90 — EXECUTION READY"
        : waitForEntry
          ? "BEST OF 90 — WAITING FOR ENTRY"
          : "BEST OF 90 — QUALIFIED");

  const isBlocked = status === "BEST OF 90 — BLOCKED";
  const isNotQualified = status === "BEST OF 90 — NOT QUALIFIED";
  const isNearSignal = status === "BEST OF 90 — NEAR-SIGNAL";
  const isWaiting = status === "BEST OF 90 — WAITING FOR ENTRY";
  const isReady = status === "BEST OF 90 — EXECUTION READY";

  const statusColor = isReady
    ? "var(--bull)"
    : isWaiting
      ? "var(--neon)"
      : isNearSignal
        ? "var(--neon)"
        : isBlocked
          ? "var(--bear)"
          : isNotQualified
            ? "var(--warn)"
            : "var(--bull)";

  const surv = item.survival;
  const survivalValue = !surv ? "N/A" : surv.sufficient ? surv.label : "INSUFFICIENT";
  const survivalColor =
    !surv || !surv.sufficient
      ? "var(--warn)"
      : surv.label === "STRONG"
        ? "var(--bull)"
        : surv.label === "MODERATE"
          ? "var(--neon)"
          : surv.label === "LOW"
            ? "var(--warn)"
            : "var(--bear)";

  const handleCopyDbotPayload = () => {
    const payload = {
      source: "APEX_SENTINEL_BEST_OF_90",
      timestamp: new Date().toISOString(),
      market: item.symbol,
      marketName: item.name,
      contract: c.label,
      contractType: c.side.toUpperCase(),
      barrier: c.barrier ?? "N/A",
      targetEntryDigit: d ? d.digit : "WAIT_FOR_TRIGGER",
      entryTriggerTouch: item.entryTrigger?.preferredTouch ?? "ANY",
      entryConfidence: item.entryPoint?.preferred ? Math.round(((item.entryPoint.preferred.pWin ?? 0) * 100)) : item.score,
      validityWindow: ep?.window?.label ?? "15-20 TICKS",
      validityWindowKind: ep?.window?.kind ?? "DYNAMIC",
      validityBasis: ep?.window?.basis ?? "Dynamic entry window",
      invalidationConditions: item.invalidation ?? [],
      instruction: item.signal?.instruction?.headline ?? "AWAIT_QUALIFIED_TRIGGER",
      instructionDetail: item.signal?.instruction?.detail ?? "",
      operatorSurfaceGate: gate.qualified ? "QUALIFIED" : "NOT_QUALIFIED",
      executionReady: isExecutionReady,
      stage4Verdict: item.finalDecision?.verdict ?? "EVALUATING",
      stage4Significance: item.finalDecision?.significance?.passesCorrection ? "PASSED" : "UNCONFIRMED",
      recommendedStake: item.recommendedStake?.drawdownAdjustedStake ?? 1.0,
      disclaimer: "DBot Handoff is an analytical blueprint only. Does not place automatic trades.",
    };

    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    toast.success("DBot execution handoff copied to clipboard");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <section
      ref={cardRef}
      id="best-of-90-primary-signal-card"
      className="glass rounded-xl border border-border/50 p-5 transition-shadow duration-700 md:p-7"
      style={
        focused
          ? {
              borderColor: "var(--bull)",
              boxShadow: "0 0 0 2px color-mix(in oklab, var(--bull) 55%, transparent)",
            }
          : undefined
      }
    >
      {/* ── 1. HEADER & CANONICAL STATUS ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold tracking-[0.25em] text-[var(--neon)]">
            #1 BEST OF 90
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            RANK #1 / {bestOf90?.populationSize ?? 90} CELLS EVALUATED
          </span>
          <span className="ml-2 rounded border border-[var(--bull)]/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--bull)]">
            SURFACE VETTED
          </span>
          <span
            className="rounded border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: statusColor, borderColor: statusColor }}
          >
            {status}
          </span>
          <span className="rounded border border-border/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {c.phase}
          </span>
          {item.preferred && (
            <span className="rounded border border-[var(--accent)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">
              Primary Contract
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{
              color: gate.qualified ? "var(--bull)" : "var(--warn)",
              borderColor: gate.qualified ? "var(--bull)" : "var(--warn)",
            }}
          >
            SURFACE: {gate.qualified ? "QUALIFIED" : `NOT QUALIFIED (${gate.blockers.length} BLOCKERS)`}
          </span>
          <span
            className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{
              color: isExecutionReady ? "var(--bull)" : "var(--muted-foreground)",
              borderColor: isExecutionReady ? "var(--bull)" : "var(--border)",
            }}
          >
            EXECUTION READY: {isExecutionReady ? "YES" : "NO"}
          </span>
        </div>
      </div>

      {/* ── 2. ASSET & CONTRACT HEADLINE ── */}
      <div className="mt-4 flex flex-col justify-between gap-2 md:flex-row md:items-baseline">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">
            {item.symbol} <span className="text-muted-foreground">·</span> {c.label}{" "}
            <span className="text-lg font-mono text-muted-foreground">
              ({c.side.toUpperCase()})
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.name} · regime {item.intel.regime?.label ?? "UNKNOWN"} · {c.n} tick sample ·
            scanned at {new Date(item.intel.updatedAt || Date.now()).toLocaleTimeString()}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyDbotPayload}
            className="gap-1.5 font-mono text-xs"
          >
            {copied ? <Check size={14} className="text-bull" /> : <Copy size={14} />}
            {copied ? "Copied Handoff" : "Copy DBot Payload"}
          </Button>
        </div>
      </div>

      {/* ── 3. OPERATOR SURFACE GATE & EXECUTION READINESS BANNER ── */}
      {(!gate.qualified || isBlocked || !isExecutionReady) && (
        <div
          className="mt-4 rounded-lg border p-4"
          style={{
            borderColor: isBlocked ? "var(--bear)" : "var(--warn)",
            background: isBlocked
              ? "color-mix(in oklab, var(--bear) 8%, transparent)"
              : "color-mix(in oklab, var(--warn) 6%, transparent)",
          }}
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              size={18}
              style={{ color: isBlocked ? "var(--bear)" : "var(--warn)" }}
              className="mt-0.5 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p
                className="font-mono text-xs font-bold uppercase tracking-[0.2em]"
                style={{ color: isBlocked ? "var(--bear)" : "var(--warn)" }}
              >
                {isBlocked
                  ? "BEST OF 90 — BLOCKED FROM SURFACE CLEARANCE"
                  : !gate.qualified
                    ? "BEST OF 90 — OPERATOR SURFACE GATE RESTRAINED"
                    : "BEST OF 90 — AWAITING EXECUTION READINESS"}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-foreground/90">
                {gate.blockers.map((b, idx) => (
                  <li key={idx} className="flex items-baseline gap-2">
                    <span className="font-mono text-bear">▸</span>
                    <span>{b}</span>
                  </li>
                ))}
                {!isExecutionReady && (item.executionReadyReasons?.length ?? 0) > 0 && (
                  <li className="flex items-baseline gap-2 text-muted-foreground">
                    <span className="font-mono">ℹ</span>
                    <span>
                      Execution readiness hold: {item.executionReadyReasons?.join("; ")}
                    </span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── NEAR-SIGNAL DIAGNOSTIC PANEL ── */}
      {(item.nearSignal?.isNearSignal || bestOf90?.nearSignal?.isNearSignal) && (
        <div className="mt-4 rounded-lg border border-[var(--neon)]/60 bg-[color-mix(in_oklab,var(--neon)_6%,transparent)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crosshair size={16} className="text-[var(--neon)]" />
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[var(--neon)]">
                DIAGNOSTIC CLASSIFICATION: NEAR-SIGNAL
              </span>
            </div>
            <span className="rounded bg-[var(--neon)]/20 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--neon)]">
              NOT EXECUTABLE
            </span>
          </div>
          <p className="mt-2 text-xs text-foreground/90">
            Candidate demonstrates strong multi-engine alignment but is held pending a narrow execution condition.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Stack Strengths:
              </span>
              <ul className="mt-1 space-y-0.5 text-xs text-foreground">
                {(item.nearSignal ?? bestOf90?.nearSignal)?.strengths.map((s, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-[var(--bull)] shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Missing Condition(s):
              </span>
              <ul className="mt-1 space-y-0.5 text-xs text-foreground">
                {(item.nearSignal ?? bestOf90?.nearSignal)?.missingConditions.map((m, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <Clock size={12} className="text-[var(--warn)] shrink-0" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. AUTHORITATIVE EXECUTION INSTRUCTION ── */}
      {item.signal?.instruction && (
        <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--neon)]">
              SENTINEL EXECUTION INSTRUCTION
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              STATE: {item.signal.instruction.state} · ACTIONABLE:{" "}
              {item.signal.instruction.actionable ? "YES" : "NO"}
            </span>
          </div>
          <p className="mt-1 font-display text-lg font-semibold text-foreground">
            {item.signal.instruction.headline}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.signal.instruction.detail}
          </p>
        </div>
      )}

      {/* ── 5. PRIMARY SCORE GAUGES ── */}
      <div className="mt-6 flex flex-wrap items-center gap-6">
        <ScoreRing value={item.score} label="Opportunity" tone="neon" size={120} />
        <ScoreRing
          value={item.setup?.score ?? c.quality}
          label="Setup Quality"
          tone="bull"
          size={120}
          sublabel={item.setup?.grade ?? "PRIME"}
        />
        <ScoreRing value={c.confidence} label="Confidence" tone="bull" size={120} />
        <ScoreRing
          value={c.danger}
          label="Danger"
          tone={c.danger > 45 ? "bear" : "warn"}
          size={120}
          sublabel="Limit ≤ 45"
        />
        <ScoreRing
          value={c.contradiction}
          label="Contradiction"
          tone={c.contradiction > 40 ? "bear" : "warn"}
          size={120}
          sublabel="Tolerance ≤ 40%"
        />
      </div>

      {/* ── 6. AUTHORITATIVE 10-DIMENSION SIGNAL EVIDENCE MATRIX ── */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* CARD 1: ENGINE AGREEMENT & SUPPORT */}
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            1. Engine Agreement &amp; Support
          </div>
          <div
            className="mt-1 font-mono text-2xl font-bold"
            style={{
              color:
                item.agreement === "SUPPORT"
                  ? "var(--bull)"
                  : item.agreement === "NEUTRAL"
                    ? "var(--neon)"
                    : "var(--bear)",
            }}
          >
            {item.agreement}
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
            <div>
              Regime:{" "}
              <span className="text-foreground">
                {item.regimeReport ? `${item.regimeReport.state} (${item.regimeReport.confidence}/100)` : "UNKNOWN"}
              </span>
            </div>
            <div>
              Evidence Fusion:{" "}
              <span className="text-foreground">
                {item.evidenceFusion && item.evidenceFusion.effectiveScore != null
                  ? `${item.evidenceFusion.effectiveScore.toFixed(0)}/100 (${item.evidenceFusion.consensus ?? "NEUTRAL"})`
                  : "NOT AVAILABLE"}
              </span>
            </div>
            <div>
              Calibration Win:{" "}
              <span className="text-foreground">
                {item.calibration && (item.calibration.calibratedProbability != null || (item.calibration as any).calibratedProb != null)
                  ? `${(((item.calibration.calibratedProbability ?? (item.calibration as any).calibratedProb ?? 0)) * 100).toFixed(1)}%`
                  : "NOT AVAILABLE"}
              </span>
            </div>
            <div>
              Markov Context:{" "}
              <span className="text-foreground">
                {item.contextMarkov && (item.contextMarkov.preferredPWin != null || (item.contextMarkov as any).contextWinProb != null)
                  ? `Favors Digit ${item.contextMarkov.preferredDigit ?? "—"} (${(((item.contextMarkov.preferredPWin ?? (item.contextMarkov as any).contextWinProb ?? 0)) * 100).toFixed(1)}%)`
                  : "NOT AVAILABLE"}
              </span>
            </div>
            <div>
              Convergence:{" "}
              <span className="text-foreground">
                {item.convergence ? `${item.convergence.state} (${item.convergence.score}/100)` : "NOT AVAILABLE"}
              </span>
            </div>
          </div>
        </div>

        {/* CARD 2: DYNAMIC ENTRY POINT DIGIT */}
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            2. Entry Point Digit
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <div
              className={`font-display font-bold leading-none ${d ? "text-4xl" : "text-base"}`}
              style={{ color: d && !waitForEntry ? "var(--bull)" : "var(--warn)" }}
            >
              {entryDigitText}
            </div>
            <span
              className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em]"
              style={{ color: d && !waitForEntry ? "var(--bull)" : "var(--warn)" }}
            >
              {ep?.status ?? "ANALYZING"}
            </span>
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
            {d ? (
              <>
                <div>
                  P(win | entry):{" "}
                  <span className="text-bull font-bold">
                    {(((d.pWin ?? (d as any).winRate ?? 0)) * 100).toFixed(1)}%
                  </span>{" "}
                  (95% LB: {(((d.pWinLower ?? (d as any).lowerBound ?? 0)) * 100).toFixed(1)}%)
                </div>
                <div>
                  Sample N: <span className="text-foreground">{d.n ?? 0} occurrences</span>
                </div>
                <div>
                  Margin: <span className="text-bull">+{(d.edgePp ?? (d as any).margin ?? 0).toFixed(1)} pts</span> vs baseline
                </div>
                <div>
                  Runner-up Digit:{" "}
                  <span className="text-foreground">
                    {ep?.runnerUpDigit != null ? `Digit ${ep.runnerUpDigit} (${(ep.runnerUpScore ?? 0).toFixed(0)}/100)` : "NONE"}
                  </span>
                </div>
                <div>
                  Wait: ~{(d.expectedWaitTicks ?? 0).toFixed(0)}t · Seen: {d.sinceSeen ?? (d as any).ticksSinceLastSeen ?? 0}t ago
                </div>
              </>
            ) : (
              <p className="text-xs text-warn">
                No entry digit validated yet. Awaiting conditional evidence sample.
              </p>
            )}
          </div>
        </div>

        {/* CARD 3: ENTRY TRIGGER INTELLIGENCE */}
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            3. Entry Trigger (Which Print)
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="font-mono text-xl font-bold text-foreground">
              {item.entryTrigger?.preferredTouch === "FIRST"
                ? "1ST TOUCH (AFTER ABSENCE)"
                : item.entryTrigger?.preferredTouch === "SUBSEQUENT"
                  ? "SUBSEQUENT TOUCH (CLUSTER)"
                  : "ANY DIGIT PRINT"}
            </div>
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
            <div>
              Trigger Verdict:{" "}
              <span className="text-foreground">
                {item.entryTrigger?.verdict ?? "STANDARD PRINT"}
              </span>
            </div>
            <div>
              Trigger Confidence:{" "}
              <span className="text-foreground">
                {item.entryTrigger
                  ? `${item.entryTrigger.preferredTouch === "SUBSEQUENT" ? item.entryTrigger.subsequent.stability : item.entryTrigger.first.stability}/100`
                  : "NOT AVAILABLE"}
              </span>
            </div>
            <div>
              Skip Next Touch:{" "}
              <span
                style={{
                  color: item.entryTrigger?.nextTouchAligned === false ? "var(--bear)" : "var(--bull)",
                }}
              >
                {item.entryTrigger?.nextTouchAligned === false ? "YES — SKIP 1ST PRINT" : "NO — ENTER NEXT PRINT"}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
              {item.entryTrigger?.instruction ?? "Enter on next valid digit print."}
            </p>
          </div>
        </div>

        {/* CARD 4: VALIDITY WINDOW & INVALIDATION */}
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            4. Validity Window &amp; Invalidation
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-[var(--neon)]">
            {ep?.window?.label ?? "15-20 TICKS"}
          </div>
          <p className="text-[11px] text-muted-foreground">{ep?.window?.basis ?? "Dynamic entry window"}</p>
          <div className="mt-2 border-t border-border/40 pt-2">
            <div className="text-[9px] uppercase tracking-[0.2em] text-bear">Invalidates If:</div>
            <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-muted-foreground">
              {(item.invalidation ?? []).slice(0, 3).map((r, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-bear">▸</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* CARD 5: DBOT EXECUTION SURVIVAL */}
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            5. DBot Execution Survival
          </div>
          <div className="mt-1 font-mono text-2xl font-bold" style={{ color: survivalColor }}>
            {survivalValue}
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
            <div>
              Post-entry Win Rate:{" "}
              <span className="text-foreground">
                {surv && surv.postEntryWinRate != null ? `${(surv.postEntryWinRate * 100).toFixed(1)}%` : "N/A"}
              </span>{" "}
              (Base: {((c.theoretical ?? 0) * 100).toFixed(0)}%)
            </div>
            <div>
              Observed Sequences:{" "}
              <span className="text-foreground">{surv?.sequences ?? 0}</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
              {surv?.summary ?? "Post-entry survival analysis requires validated entry digit sample."}
            </p>
          </div>
        </div>

        {/* CARD 6: 1,000-TICK DIGIT PSYCHOLOGY */}
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            6. 1,000-Tick Digit Psychology
          </div>
          <div className="mt-1 flex items-baseline justify-between font-mono">
            <span
              className="text-lg font-bold"
              style={{
                color:
                  item.digitPsychology?.verdict === "SUPPORT"
                    ? "var(--bull)"
                    : item.digitPsychology?.verdict === "CONFLICT"
                      ? "var(--bear)"
                      : "var(--neon)",
              }}
            >
              {item.digitPsychology?.verdict ?? "NEUTRAL"}
            </span>
            <span className="text-xs text-muted-foreground">
              Score: {item.digitPsychology?.score ?? 50}/100
            </span>
          </div>
          <div className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">
            <div>
              Winning Zone:{" "}
              <span className="text-bull font-semibold">
                [{item.digitPsychology?.winningZone?.join(", ") ?? "—"}]
              </span>
            </div>
            <div>
              Losing Zone:{" "}
              <span className="text-bear font-semibold">
                [{item.digitPsychology?.losingZone?.join(", ") ?? "—"}]
              </span>{" "}
              · Boundary: {item.digitPsychology?.boundary?.join(", ") || "—"}
            </div>
            <div>
              Dominant Greens: {[item.digitState?.green, item.digitState?.secondGreen].filter((v): v is number => v != null).join(", ") || "—"} · Reds:{" "}
              {[item.digitState?.red, item.digitState?.secondRed].filter((v): v is number => v != null).join(", ") || "—"}
            </div>
            <div>
              Shifting: ↑ Digit {item.digitState?.mostIncreasing ?? "—"} · ↓ Digit{" "}
              {item.digitState?.mostDecreasing ?? "—"}
            </div>
          </div>
        </div>

        {/* CARD 7: MULTI-WINDOW PRESSURE */}
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            7. Multi-Window Pressure (15/30/60/120t)
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-foreground">
            {item.priceAction?.alignment ?? "NEUTRAL"}
          </div>
          <div className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">
            <div>
              120t Trend:{" "}
              <span className="text-foreground">
                {item.priceAction?.winningSide?.direction ?? "STABLE"} ({typeof item.priceAction?.winningSide?.rateOfChangePp === "number" ? ((item.priceAction.winningSide.rateOfChangePp > 0 ? "+" : "") + item.priceAction.winningSide.rateOfChangePp.toFixed(1) + "%") : "0%"})
              </span>
            </div>
            <div>
              Takeover State:{" "}
              <span
                style={{
                  color: item.priceAction?.takeover && item.priceAction.takeover.state !== "NO TAKEOVER" ? "var(--bear)" : "var(--bull)",
                }}
              >
                {item.priceAction?.takeover?.state ?? "NO TAKEOVER"}
              </span>
            </div>
            <div>
              {item.priceActionField?.summary ?? "Multi-window pressure summary unavailable."}
            </div>
          </div>
        </div>

        {/* CARD 8: LOSING-SIDE PRESSURE */}
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            8. Losing-Side Pressure Dynamics
          </div>
          <div className="mt-1 flex items-baseline justify-between font-mono">
            <span
              className="text-lg font-bold"
              style={{
                color:
                  (c.losingSidePressure?.index ?? 0) > 40
                    ? "var(--bear)"
                    : "var(--bull)",
              }}
            >
              {(c.losingSidePressure?.state ?? "CALM")} ({((c.losingSidePressure?.index ?? 0)).toFixed(0)}/100)
            </span>
            <span className="text-xs text-muted-foreground">
              Modifier: ×{((c.losingSidePressure?.modifier ?? 1)).toFixed(3)}
            </span>
          </div>
          <div className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">
            <div>
              Penalty Applied:{" "}
              <span className="text-bear">{c.losingSidePressure?.penaltyPoints ?? 0} pts</span>
            </div>
            <div>
              Rising Losers:{" "}
              <span className="text-foreground">
                {c.losingSidePressure?.risingCount ?? 0} losing digits climbing
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
              {c.losingSidePressure?.reason ?? "Losing digits remain suppressed."}
            </p>
          </div>
        </div>

        {/* CARD 9: STATISTICAL PROOF & PERFORMANCE */}
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            9. Statistical Validation &amp; SPRT
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-foreground">
            SPRT: {item.sequentialTest?.verdict ?? "INSUFFICIENT DATA"}
          </div>
          <div className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">
            <div>
              LLR: <span className="text-foreground">{typeof item.sequentialTest?.llr === "number" ? item.sequentialTest.llr.toFixed(2) : "—"}</span> (N={item.sequentialTest?.n ?? 0})
            </div>
            <div>
              Exact Combo:{" "}
              <span className="text-foreground">
                {item.combination?.exact
                  ? `${((item.combination.exact.weightedWinRate ?? item.combination.exact.winRate ?? 0) * 100).toFixed(1)}% (N=${item.combination.exact.n ?? 0}, Exp ${(item.combination.exact.weightedExpectancy ?? item.combination.exact.expectancy ?? 0).toFixed(2)})`
                  : "NO COMBO DATA"}
              </span>
            </div>
            <div>
              Simulator Performance:{" "}
              <span className="text-foreground">
                {sim && sim.n ? `${simWins}/${sim.n} won (${(((sim.winRate ?? 0)) * 100).toFixed(1)}%)` : "NO SAMPLE"}
              </span>
            </div>
          </div>
        </div>

        {/* CARD 10: RELATIVE EDGE & PERSISTENCE */}
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            10. Relative Edge vs 90 Field
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-[var(--neon)]">
            {(item.relative?.relativeEdge ?? 0) > 0 ? "+" : ""}
            {(item.relative?.relativeEdge ?? 0).toFixed(2)}pp
          </div>
          <div className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">
            <div>
              Field Position:{" "}
              <span className="text-foreground">
                #{item.relative?.fieldRank ?? 1} / {item.relative?.fieldSize ?? 90} ({item.relative?.normalized != null ? item.relative.normalized.toFixed(0) : "100"}/100)
              </span>
            </div>
            <div>
              Risk-Adjusted Edge:{" "}
              <span className="text-foreground">
                {(item.relative?.riskAdjustedEdge ?? 0).toFixed(2)}
              </span>
            </div>
            <div>
              Persistence:{" "}
              <span className="text-foreground">
                {item.persistence?.persistence != null ? item.persistence.persistence.toFixed(0) : (item.persistence as any)?.persistenceScore != null ? (item.persistence as any).persistenceScore.toFixed(0) : "N/A"}/100 (Top-3 in {item.persistence?.topThree ?? (item.persistence as any)?.top3Count ?? 0}/{item.persistence?.scans ?? (item.persistence as any)?.scanCount ?? 0} scans)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 6.5 STAGE 4 RISK-INTEGRATED FINAL DECISION & FRACTIONAL-KELLY SIZING ── */}
      {item.finalDecision && (
        <div className="mt-6 rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--neon)]">
              STAGE 4 · RISK INTEGRATION &amp; FRACTIONAL-KELLY SIZING
            </div>
            <span
              className="rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider"
              style={{
                backgroundColor:
                  item.finalDecision.verdict === "CLEARED"
                    ? "var(--bull-subtle, rgba(34, 197, 94, 0.15))"
                    : "var(--bear-subtle, rgba(239, 68, 68, 0.15))",
                color:
                  item.finalDecision.verdict === "CLEARED"
                    ? "var(--bull, #22c55e)"
                    : "var(--bear, #ef4444)",
              }}
            >
              {item.finalDecision.verdict}
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-border/40 bg-background/30 p-2.5">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Significance Guard (FDR &amp; MES)
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-foreground">
                {item.finalDecision.significance?.passesCorrection ? "PASSED (HONEST)" : "UNCONFIRMED"}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {item.finalDecision.significance?.fdrAdjustedThreshold != null
                  ? `p = ${item.finalDecision.significance.fdrAdjustedThreshold.toFixed(4)} threshold across ${item.finalDecision.significance.activeComparisons ?? 90} cells`
                  : item.finalDecision.significance?.detail ?? "Evaluating multi-hypothesis significance"}
              </div>
            </div>

            <div className="rounded border border-border/40 bg-background/30 p-2.5">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Recommended Stake
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-[var(--bull,#22c55e)]">
                ${(item.finalDecision.recommendedStake?.drawdownAdjustedStake ?? 1).toFixed(2)}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                Kelly {(((item.finalDecision.recommendedStake?.kellyFraction ?? 0.05)) * 100).toFixed(1)}% · Max Bankroll {(((item.finalDecision.recommendedStake?.maxBankrollPct ?? 0.02)) * 100).toFixed(1)}%
              </div>
            </div>

            <div className="rounded border border-border/40 bg-background/30 p-2.5">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Circuit Breaker State
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-foreground">
                {item.finalDecision.circuitBreaker?.tripped ? "TRIPPED (HALT)" : "NOMINAL"}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {item.finalDecision.circuitBreaker?.reason || "Session risk within normal boundaries"}
              </div>
            </div>

            <div className="rounded border border-border/40 bg-background/30 p-2.5">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Portfolio Exposure
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-foreground">
                {item.finalDecision.exposure
                  ? `${item.finalDecision.exposure.recommendation}`
                  : "WITHIN LIMITS"}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {item.finalDecision.exposure?.totalProposedExposure != null
                  ? `$${item.finalDecision.exposure.totalProposedExposure.toFixed(2)} proposed exposure`
                  : "Correlation groups below maximum exposure ceiling"}
              </div>
            </div>
          </div>

          <p className="mt-2 text-xs text-muted-foreground font-mono">
            {item.finalDecision.summary}
          </p>
        </div>
      )}

      {/* ── 7. WHY #1 WON — ATTRIBUTION BREAKDOWN ── */}
      <div className="mt-6 rounded-lg border border-border/60 bg-background/40 p-4">
        <SectionTitle hint="every point in the ranking score, attributed">
          Why this cell ranks #1 across all 90 evaluated candidates
        </SectionTitle>
        <ul className="mt-2 space-y-1.5">
          {(item.factors ?? []).map((f) => (
            <li key={f.label} className="flex items-baseline gap-3 text-xs">
              <span
                className="w-16 shrink-0 text-right font-mono"
                style={{
                  color: (f.points ?? 0) > 0 ? "var(--bull)" : (f.points ?? 0) < 0 ? "var(--bear)" : undefined,
                }}
              >
                {(f.points ?? 0) > 0 ? "+" : ""}
                {(f.points ?? 0).toFixed(1)}
              </span>
              <span className="w-44 shrink-0 text-foreground/85">{f.label}</span>
              <span className="text-muted-foreground">{f.detail}</span>
            </li>
          ))}
          <li className="flex items-baseline gap-3 border-t border-border/50 pt-1.5 text-xs">
            <span className="w-16 shrink-0 text-right font-mono text-foreground font-bold">
              {(item.score ?? 0).toFixed(1)}
            </span>
            <span className="w-44 shrink-0 font-semibold text-foreground">
              Final ranking score
            </span>
            <span className="text-muted-foreground">Clamped to 0–100 after all contributions</span>
          </li>
        </ul>
      </div>

      {/* ── 8. DBOT EXECUTION HANDOFF INTERFACE ── */}
      <div className="mt-6 rounded-lg border border-border/60 bg-background/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--neon)]">
              EXECUTION HANDOFF · DBOT
            </span>
            <p className="text-xs text-muted-foreground">
              Analysis only — this app never places a trade. Copy parameters into your Deriv DBot.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyDbotPayload}
            className="gap-1.5 font-mono text-xs"
          >
            {copied ? <Check size={14} className="text-bull" /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy Payload"}
          </Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs">
          <div className="rounded border border-border/50 bg-background/40 p-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Target Market
            </div>
            <div className="font-bold text-foreground">{item.symbol}</div>
          </div>
          <div className="rounded border border-border/50 bg-background/40 p-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Target Contract
            </div>
            <div className="font-bold text-foreground">{c.label}</div>
          </div>
          <div className="rounded border border-border/50 bg-background/40 p-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Wait For Digit
            </div>
            <div className="font-bold text-[var(--neon)]">{entryDigitText}</div>
          </div>
          <div className="rounded border border-border/50 bg-background/40 p-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Validity
            </div>
            <div className="font-bold text-foreground">{ep?.window?.label ?? "15-20 TICKS"}</div>
          </div>
        </div>
      </div>

      {/* ── 9. TRADE FEEDBACK & LIVE ALERT BANNER ── */}
      <div className="mt-6 border-t border-border/50 pt-5">
        <TradeFeedback item={item} />
      </div>

      <CanonicalAlertBanner item={item} alerts={alerts} stale={alertStale} />
    </section>
  );
}
