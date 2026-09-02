import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, Gauge, Shield, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/Panel";
import { useParity30 } from "@/hooks/useParity30";
import { parity30Runtime } from "@/lib/parity/runtime";
import type { CellStage, Parity30CellSnapshot } from "@/lib/parity/types";

const stageTone: Record<CellStage, string> = {
  WATCHING: "text-slate-300 border-slate-700 bg-slate-800/40",
  DEVELOPING: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  MATURE: "text-cyan-300 border-cyan-500/30 bg-cyan-500/10",
  READY: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  DECAYING: "text-orange-300 border-orange-500/30 bg-orange-500/10",
  REJECTED: "text-rose-300 border-rose-500/30 bg-rose-500/10",
};

function ageLabel(ms: number) {
  if (ms < 1000) return "<1s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function CellTile({ cell, selected, onSelect }: { cell: Parity30CellSnapshot; selected: boolean; onSelect: () => void }) {
  const stage = cell.maturity.stage;
  return (
    <button onClick={onSelect} className={cn("text-left rounded-xl border p-3 transition-all hover:border-cyan-400/60", selected ? "border-cyan-400 bg-cyan-400/10 shadow-lg" : "border-border/50 bg-card/40")}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono font-bold text-sm">{cell.identity.marketId}</div>
        <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-mono", stageTone[stage])}>{stage}</span>
      </div>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <div className={cn("text-xl font-black", cell.identity.parity === "EVEN" ? "text-cyan-300" : "text-violet-300")}>{cell.identity.parity}</div>
          <div className="text-[10px] text-muted-foreground">{cell.maturity.observations} observations · {ageLabel(cell.maturity.ageMs)}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg">{cell.suitability.toFixed(0)}</div>
          <div className="text-[9px] text-muted-foreground">SUITABILITY</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-current opacity-80" style={{ width: `${cell.suitability}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[9px] font-mono text-muted-foreground">
        <span>M {cell.maturity.score.toFixed(0)}</span>
        <span>+{cell.maturity.supportiveObservations}</span>
        <span>−{cell.maturity.adverseObservations}</span>
      </div>
    </button>
  );
}

function Detail({ cell }: { cell: Parity30CellSnapshot }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
      <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[.22em] text-muted-foreground">Persistent cell</div>
            <div className="text-2xl font-black mt-1">{cell.identity.marketId} · {cell.identity.parity}</div>
          </div>
          <span className={cn("px-2 py-1 rounded border text-[10px] font-mono", stageTone[cell.maturity.stage])}>{cell.maturity.stage}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[["Suitability", cell.suitability.toFixed(0)], ["Maturity", cell.maturity.score.toFixed(0)], ["Observations", `${cell.maturity.observations}`], ["Age", ageLabel(cell.maturity.ageMs)]].map(([k,v]) => <div key={k} className="rounded-lg bg-muted/30 p-3"><div className="text-[9px] uppercase text-muted-foreground">{k}</div><div className="font-mono text-lg mt-1">{v}</div></div>)}
        </div>
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs">
          <div className="font-semibold">Maturity gate</div>
          <div className="text-muted-foreground mt-1">MATURE is earned only when the independent engine dimensions form a coherent thesis. Observation count and age are eligibility floors, not maturity evidence; sustained thesis failure is required for decay.</div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div>Supportive {cell.maturity.supportiveObservations}</div>
          <div>Adverse {cell.maturity.adverseObservations}</div>
          <div>Persistence {cell.maturity.persistenceTicks}t</div>
          <div>Sentinel {cell.sentinelSupport.toFixed(0)}</div>
        </div>
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-violet-300">Market intelligence — why this cell exists</div>
          <div className="text-sm font-semibold">{cell.marketMechanism}</div>
          <div className="text-[10px] text-muted-foreground">Intelligence quality {cell.intelligenceQuality.toFixed(0)}/100</div>
          <ul className="space-y-1 text-[10px] text-muted-foreground list-disc pl-4">{cell.marketWhy.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-cyan-300">Thesis dimensions</div>
          <div className="grid grid-cols-2 gap-1.5">{cell.maturity.thesis.dimensions.map(d => <div key={d.name} className="rounded bg-muted/30 px-2 py-1.5 text-[9px] font-mono"><div className="flex justify-between"><span>{d.name}</span><span>{d.score.toFixed(0)}</span></div><div className="text-muted-foreground mt-0.5">{d.reason}</div></div>)}</div>
          {cell.maturity.thesis.warnings.length > 0 && <div className="text-[10px] text-amber-300">{cell.maturity.thesis.warnings[0]}</div>}
        </div>
      </div>
      <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Evidence behind this cell</div>
        <div className="flex flex-wrap gap-1.5">{cell.supportingEngines.map(e => <span key={`s-${e}`} className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-300">+ {e}</span>)}{cell.opposingEngines.map(e => <span key={`o-${e}`} className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-[10px] font-mono text-rose-300">− {e}</span>)}</div>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono"><div>Entry {cell.entryDigit ?? "—"}</div><div>Replay {cell.dbotValidated === null ? "NOT RUN" : cell.dbotValidated ? "PASS" : "FAIL"}</div><div>Support {cell.supportScore.toFixed(0)}</div><div>Conflict {cell.conflictScore.toFixed(0)}</div></div>
        {cell.hardBlocks.length > 0 && <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-[10px] font-mono text-rose-300">{cell.hardBlocks.join(" · ")}</div>}
      </div>
    </div>
  );
}

export function Parity30Terminal() {
  const view = useParity30();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => view.cells.find(c => c.identity.cellId === selectedId) ?? view.finalCell ?? view.top?.cell ?? view.cells[0] ?? null, [view.cells, selectedId, view.finalCell, view.top]);
  const mature = view.cells.filter(c => c.maturity.stage === "MATURE" || c.maturity.stage === "READY");
  const ready = view.cells.filter(c => c.maturity.stage === "READY");
  const reset = () => parity30Runtime.reset();

  return <div className="space-y-5">
    <Panel title="Precision Parity — 30 Persistent Cells" subtitle="One system · every cell watches its market · maturity is earned over time · engines provide evidence" accent="magenta">
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border/50 bg-card/40 p-4"><div className="text-[10px] text-muted-foreground">CELL UNIVERSE</div><div className="text-2xl font-black mt-1">{view.cells.length}/30</div><div className="text-[10px] text-muted-foreground">persistent cells</div></div>
          <div className="rounded-xl border border-border/50 bg-card/40 p-4"><div className="text-[10px] text-muted-foreground">MATURE</div><div className="text-2xl font-black mt-1 text-cyan-300">{mature.length}</div><div className="text-[10px] text-muted-foreground">earned maturity</div></div>
          <div className="rounded-xl border border-border/50 bg-card/40 p-4"><div className="text-[10px] text-muted-foreground">READY</div><div className="text-2xl font-black mt-1 text-emerald-300">{ready.length}</div><div className="text-[10px] text-muted-foreground">execution candidates</div></div>
          <div className="rounded-xl border border-border/50 bg-card/40 p-4"><div className="text-[10px] text-muted-foreground">ENGINE COUNCIL</div><div className="text-2xl font-black mt-1">{view.snapshots[0]?.engineCount ?? "—"}</div><div className="text-[10px] text-muted-foreground">normalized streams / market</div></div>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="text-[10px] uppercase tracking-[.25em] text-emerald-300">Authoritative execution</div>
          {view.finalCell ? <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><div className="text-3xl font-black">{view.finalCell.identity.marketId} · {view.finalCell.identity.parity}</div><div className="text-xs text-muted-foreground mt-1">Only a persistent READY cell with a validated downstream entry/replay path can appear here.</div></div><div className="text-right"><div className="font-mono text-3xl">{view.finalCell.suitability.toFixed(0)}</div><div className="text-[9px] text-muted-foreground">SUITABILITY</div></div></div> : <div className="mt-2 text-2xl font-black">NO EXECUTION CELL</div>}
          <div className="mt-3 text-[10px] font-mono text-muted-foreground">Mature cells remain visible even when the next tick disagrees. They decay only when adverse evidence persists.</div>
        </div>

        {mature.length > 0 && <div>
          <div className="flex items-center gap-2 mb-3"><Target className="w-4 h-4 text-cyan-300"/><div><div className="text-sm font-bold">Matured Cells</div><div className="text-[10px] text-muted-foreground">These cells have earned maturity through observation history. This is where opportunities first become visible.</div></div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">{[...mature].sort((a,b) => b.suitability - a.suitability || b.maturity.score - a.maturity.score).map(c => <CellTile key={c.identity.cellId} cell={c} selected={selected?.identity.cellId === c.identity.cellId} onSelect={() => setSelectedId(c.identity.cellId)} />)}</div>
        </div>}

        <div>
          <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><Clock3 className="w-4 h-4 text-muted-foreground"/><div><div className="text-sm font-bold">All 30 Living Cells</div><div className="text-[10px] text-muted-foreground">No cell is selected as a winner before it has watched its market.</div></div></div><button onClick={reset} className="px-3 py-1.5 rounded-lg border border-border/60 text-xs font-mono hover:bg-muted/40">Reset observations</button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">{view.cells.map(cell => <CellTile key={cell.identity.cellId} cell={cell} selected={selected?.identity.cellId === cell.identity.cellId} onSelect={() => setSelectedId(cell.identity.cellId)} />)}</div>
        </div>

        {selected && <Detail cell={selected} />}
      </div>
    </Panel>
  </div>;
}
