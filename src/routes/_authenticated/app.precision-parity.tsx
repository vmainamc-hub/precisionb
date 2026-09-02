import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, BrainCircuit, Radio, Sparkles } from "lucide-react";
import { Parity30Terminal } from "@/components/precision-parity/Parity30Terminal";
import { derivBus } from "@/lib/deriv/tick-bus";

export const Route = createFileRoute("/_authenticated/app/precision-parity")({
  head: () => ({
    meta: [
      { title: "Precision Parity — 30 Cell Intelligence" },
      { name: "description", content: "Unified EVEN/ODD intelligence across the 30-cell parity universe." },
    ],
  }),
  component: PrecisionParity,
});

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function PrecisionParity() {
  const clock = useClock();
  const [busStatus, setBusStatus] = useState(derivBus.getStatus());
  useEffect(() => derivBus.onStatus(setBusStatus), []);

  return (
    <div className="min-h-screen grid-bg text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/40 glass">
        <div className="max-w-[1900px] mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid place-items-center w-10 h-10 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)]"><Sparkles className="w-5 h-5" /></div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Precision Parity AI</div>
              <h1 className="text-lg font-semibold leading-tight">30-Cell Even / Odd Intelligence</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="hidden md:flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5"><Radio className="w-3.5 h-3.5" /> {busStatus.toUpperCase()}</span>
            <span className="hidden md:flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5"><BrainCircuit className="w-3.5 h-3.5" /> 30 CELLS</span>
            <span className="hidden lg:flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5"><Activity className="w-3.5 h-3.5" /> {clock}</span>
          </div>
        </div>
      </header>
      <main className="max-w-[1900px] mx-auto px-5 py-6">
        <Parity30Terminal />
      </main>
    </div>
  );
}
