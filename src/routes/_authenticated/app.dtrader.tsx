/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Brain, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DERIV_SYMBOLS } from "@/hooks/useDerivStream";
import { derivBus } from "@/lib/deriv/tick-bus";
import { apexCore } from "@/lib/apex/core";
import { useDerivAccount } from "@/lib/deriv/account-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/dtrader")({
  head: () => ({ meta: [{ title: "Sentinel DTrader — Live Execution Cockpit" }] }),
  component: DTraderPage,
});

type ContractType =
  "DIGITEVEN" | "DIGITODD" | "DIGITOVER" | "DIGITUNDER" | "DIGITMATCH" | "DIGITDIFF";
const CONTRACTS: { id: ContractType; label: string }[] = [
  { id: "DIGITEVEN", label: "Even" },
  { id: "DIGITODD", label: "Odd" },
  { id: "DIGITOVER", label: "Over" },
  { id: "DIGITUNDER", label: "Under" },
  { id: "DIGITMATCH", label: "Matches" },
  { id: "DIGITDIFF", label: "Differs" },
];

function DTraderPage() {
  const { client, account, balance, currency, status } = useDerivAccount();
  const [symbol, setSymbol] = useState("1HZ10V");
  const [ticks, setTicks] = useState(() => derivBus.getTicks("1HZ10V"));
  const [type, setType] = useState<ContractType>("DIGITUNDER");
  const [barrier, setBarrier] = useState(6);
  const [duration, setDuration] = useState(5);
  const [stake, setStake] = useState(10);
  const [proposal, setProposal] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [finder, setFinder] = useState("");
  const [digitWindow, setDigitWindow] = useState(100);
  const [intel, setIntel] = useState<any>(null);
  const [open, setOpen] = useState<any>(null);

  const market = DERIV_SYMBOLS.find(function (m) {
    return m.symbol === symbol;
  });
  const digits = derivBus.getDigits(symbol);
  const recent = digits.slice(-digitWindow);
  const counts = useMemo(
    function () {
      return Array.from({ length: 10 }, function (_, d) {
        return recent.filter(function (x) {
          return x === d;
        }).length;
      });
    },
    [recent],
  );
  const total = Math.max(1, recent.length);

  useEffect(
    function () {
      const unsub = derivBus.subscribe([symbol]);
      const onTick = function (s: string) {
        if (s === symbol) setTicks(derivBus.getTicks(symbol).slice());
      };
      const onHistory = function (s: string) {
        if (s === symbol) setTicks(derivBus.getTicks(symbol).slice());
      };
      const a = derivBus.onTick(onTick);
      const b = derivBus.onHistory(onHistory);
      setTicks(derivBus.getTicks(symbol).slice());
      return function () {
        a();
        b();
        unsub();
      };
    },
    [symbol],
  );

  useEffect(
    function () {
      const release = apexCore.retain();
      const refresh = function () {
        setIntel(apexCore.get(symbol) || null);
      };
      refresh();
      const id = window.setInterval(refresh, 900);
      return function () {
        window.clearInterval(id);
        release();
      };
    },
    [symbol],
  );

  useEffect(
    function () {
      if (!client || status !== "open") {
        setProposal(null);
        return;
      }
      let cancelled = false;
      const payload: Record<string, any> = {
        proposal: 1,
        amount: stake,
        basis: "stake",
        contract_type: type,
        currency: currency || account?.currency || "USD",
        duration: duration,
        duration_unit: "t",
        underlying_symbol: symbol,
      };
      if (
        type === "DIGITOVER" ||
        type === "DIGITUNDER" ||
        type === "DIGITMATCH" ||
        type === "DIGITDIFF"
      )
        payload.barrier = barrier;
      setLoading(true);
      const timer = window.setTimeout(async function () {
        try {
          const res = await client.send(payload);
          if (!cancelled) setProposal(res.proposal || null);
        } catch (e) {
          if (!cancelled) {
            setProposal(null);
            toast.error((e as Error).message);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      }, 180);
      return function () {
        cancelled = true;
        window.clearTimeout(timer);
      };
    },
    [client, status, symbol, type, barrier, duration, stake, currency, account?.currency],
  );

  async function buy() {
    if (!client || !proposal?.id) {
      toast.error("Connect a Deriv account before buying.");
      return;
    }
    try {
      const price = Number(proposal.ask_price);
      const res = await client.send({ buy: proposal.id, price: price });
      const id = Number(res.buy?.contract_id);
      if (!id) throw new Error("Deriv did not return a contract ID.");
      setOpen({ id: id, label: labelFor(type, barrier), buyPrice: price });
      toast.success("Contract purchased", {
        description: labelFor(type, barrier) + " · " + symbol + " · " + id,
      });
      const sub = await client.subscribe(
        { proposal_open_contract: 1, contract_id: id, subscribe: 1 },
        function (msg) {
          const c = msg.proposal_open_contract;
          if (!c) return;
          setOpen(function (prev: any) {
            return prev
              ? {
                  ...prev,
                  status: c.status,
                  profit: Number(c.profit || 0),
                  bid: Number(c.bid_price || 0),
                  payout: Number(c.payout || prev.payout || 0),
                }
              : prev;
          });
          if (c.is_sold || c.is_expired || c.status === "won" || c.status === "lost")
            void client.forget(sub.subId);
        },
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function sell() {
    if (!client || !open?.id) return;
    try {
      await client.send({ sell: open.id, price: 0 });
      toast.success("Contract sell request sent.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const candidates = intel?.contracts || [];
  const filtered = DERIV_SYMBOLS.filter(function (m) {
    return (m.name + " " + m.symbol).toLowerCase().includes(finder.toLowerCase());
  });
  const price = ticks.length ? ticks[ticks.length - 1].price : null;

  return (
    <div className="min-h-screen bg-[#070b10] text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#080d13]/95 backdrop-blur-xl">
        <div className="max-w-[1900px] mx-auto px-3 sm:px-5 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/25 grid place-items-center">
              <ShieldCheck className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="hidden sm:block">
              <div className="text-[10px] uppercase tracking-[.25em] text-cyan-300">Sentinel</div>
              <div className="font-semibold text-sm">DTrader</div>
            </div>
          </div>
          <div className="flex-1 flex gap-1 overflow-x-auto no-scrollbar">
            {["1HZ10V", "R_10", "R_25", "R_50", "BOOM500"].map(function (s) {
              return (
                <button
                  key={s}
                  onClick={function () {
                    setSymbol(s);
                  }}
                  className={
                    "px-3 py-1.5 rounded-md text-[11px] font-mono whitespace-nowrap border " +
                    (s === symbol
                      ? "bg-cyan-400/10 border-cyan-400/35 text-cyan-200"
                      : "border-transparent text-muted-foreground hover:bg-white/5")
                  }
                >
                  {s}
                </button>
              );
            })}
            <button
              onClick={function () {
                setFinder(finder ? "" : " ");
              }}
              className="px-3 py-1.5 rounded-md border border-white/10 text-[11px] text-muted-foreground whitespace-nowrap"
            >
              + Market
            </button>
          </div>
          <div className="hidden md:flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-cyan-300" />
              {derivBus.getStatus().toUpperCase()}
            </span>
            {account ? (
              <span>
                {balance?.toFixed(2) || "—"} {currency || ""}
              </span>
            ) : (
              <span className="text-amber-300">ACCOUNT NOT CONNECTED</span>
            )}
          </div>
        </div>
      </header>

      {finder !== "" && (
        <div className="border-b border-white/10 bg-[#0a1017] p-3">
          <div className="max-w-[1900px] mx-auto">
            <Input
              autoFocus
              placeholder="Search synthetic / derived market..."
              value={finder.trim()}
              onChange={function (e) {
                setFinder(e.target.value);
              }}
              className="bg-black/20 border-white/10"
            />
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 max-h-44 overflow-y-auto">
              {filtered.map(function (m) {
                return (
                  <button
                    key={m.symbol}
                    onClick={function () {
                      setSymbol(m.symbol);
                      setFinder("");
                    }}
                    className="text-left p-2 rounded-md border border-white/10 hover:border-cyan-400/30"
                  >
                    <div className="text-[11px] font-mono">{m.symbol}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{m.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-[1900px] mx-auto p-2 sm:p-3 grid grid-cols-1 xl:grid-cols-12 gap-3">
        <section className="xl:col-span-8 2xl:col-span-9 min-w-0 space-y-3">
          <div className="rounded-xl border border-white/10 bg-[#0b1118] overflow-hidden">
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Live market
                </div>
                <div className="font-semibold">{market?.name || symbol}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-mono">{price == null ? "—" : price.toFixed(5)}</div>
                <div className="text-[9px] text-muted-foreground">
                  {ticks.length} buffered ticks
                </div>
              </div>
            </div>
            <div className="h-56 sm:h-72 p-3">
              <MiniChart ticks={ticks.slice(-100)} />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0b1118] p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-300" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  0–9 Live Digit Intelligence
                </span>
              </div>
              <div className="flex gap-1">
                {[20, 50, 100, 120, 500, 1000].map(function (w) {
                  return (
                    <button
                      key={w}
                      onClick={function () {
                        setDigitWindow(w);
                      }}
                      className={
                        "px-2 py-1 rounded text-[9px] font-mono " +
                        (digitWindow === w
                          ? "bg-cyan-400/15 text-cyan-200"
                          : "bg-white/5 text-muted-foreground")
                      }
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
              {counts.map(function (c, d) {
                const pct = (c / total) * 100;
                return (
                  <div
                    key={d}
                    className="rounded-lg border border-white/10 bg-white/[.02] p-2 text-center"
                  >
                    <div className="text-lg font-mono font-semibold">{d}</div>
                    <div className="h-14 mt-1 flex items-end justify-center">
                      <div
                        className="w-3 rounded-t bg-cyan-400/45"
                        style={{ height: Math.max(6, pct * 4) }}
                      />
                    </div>
                    <div className="text-[10px] font-mono">{pct.toFixed(1)}%</div>
                    <div className="text-[9px] text-muted-foreground">{c}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Metric
                label="EVEN"
                value={
                  (
                    (recent.filter(function (d) {
                      return d % 2 === 0;
                    }).length /
                      total) *
                    100
                  ).toFixed(1) + "%"
                }
              />
              <Metric
                label="ODD"
                value={
                  (
                    (recent.filter(function (d) {
                      return d % 2 !== 0;
                    }).length /
                      total) *
                    100
                  ).toFixed(1) + "%"
                }
              />
              <Metric label="LAST" value={recent.length ? recent[recent.length - 1] : "—"} />
              <Metric label="SAMPLE" value={recent.length} />
              <Metric label="FEED" value={derivBus.getStatus().toUpperCase()} />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0b1118] p-3">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-cyan-300" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Sentinel + DigitPulse Intelligence
              </span>
            </div>
            {intel ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Metric label="Psychology" value={intel.psychology?.summary || "LIVE"} />
                <Metric label="Regime" value={intel.regime?.label || "—"} />
                <Metric label="Liquidity" value={intel.liquidity?.top?.state || "NO DATA"} />
                <Metric label="Danger" value={Math.round(intel.danger || 0) + " / 100"} />
                <Metric label="Feed" value={intel.dataState || "—"} />
                <Metric label="Ticks" value={intel.ticks || 0} />
                <Metric label="Contracts" value={intel.contracts?.length || 0} />
                <Metric label="Last" value={intel.stats?.lastDigit ?? "—"} />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Building canonical analysis…</div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0b1118] p-3">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-cyan-300" />
              <span className="text-xs font-semibold uppercase tracking-wider">Contract Lab</span>
              <span className="ml-auto text-[9px] text-muted-foreground">Analysis only</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {candidates.map(function (c: any) {
                return (
                  <div key={c.id} className="rounded-lg border border-white/10 p-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-xs">{c.label}</span>
                      <Badge variant="outline" className="text-[8px]">
                        {c.signal?.state || c.phase || "WATCH"}
                      </Badge>
                    </div>
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      Edge {(Number(c.edge || 0) * 100).toFixed(2)}pp · danger{" "}
                      {Math.round(c.danger || 0)}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 w-full h-7 text-[9px]"
                      onClick={function () {
                        const n = Number(String(c.id).replace(/\D/g, ""));
                        setType(String(c.id).startsWith("UNDER") ? "DIGITUNDER" : "DIGITOVER");
                        setBarrier(n);
                      }}
                    >
                      Use
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {open && (
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-cyan-200">
                    Open contract
                  </div>
                  <div className="font-semibold">
                    {open.label} · {open.id}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={sell}
                  disabled={["won", "lost", "sold", "expired"].includes(open.status || "")}
                >
                  Sell
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Metric label="STATUS" value={open.status || "OPEN"} />
                <Metric
                  label="P/L"
                  value={open.profit == null ? "—" : Number(open.profit).toFixed(2)}
                />
                <Metric label="BID" value={open.bid == null ? "—" : Number(open.bid).toFixed(2)} />
              </div>
            </div>
          )}
        </section>

        <aside className="xl:col-span-4 2xl:col-span-3 min-w-0">
          <div className="xl:sticky xl:top-[68px] rounded-xl border border-white/10 bg-[#0b1118] overflow-hidden">
            <div className="p-3 border-b border-white/10 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-300" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Adaptive Trade Deck
              </span>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  Contract
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {CONTRACTS.map(function (c) {
                    return (
                      <button
                        key={c.id}
                        onClick={function () {
                          setType(c.id);
                        }}
                        className={
                          "p-2 rounded border text-[10px] " +
                          (type === c.id
                            ? "bg-cyan-400/10 border-cyan-400/40 text-cyan-100"
                            : "border-white/10 text-muted-foreground")
                        }
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {(type === "DIGITOVER" ||
                type === "DIGITUNDER" ||
                type === "DIGITMATCH" ||
                type === "DIGITDIFF") && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">
                    Digit / barrier
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {Array.from({ length: 10 }, function (_, d) {
                      return (
                        <button
                          key={d}
                          onClick={function () {
                            setBarrier(d);
                          }}
                          className={
                            "h-8 rounded font-mono text-xs " +
                            (barrier === d
                              ? "bg-cyan-400 text-black"
                              : "bg-white/5 text-foreground")
                          }
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  Duration
                </div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 5, 10].map(function (v) {
                    return (
                      <button
                        key={v}
                        onClick={function () {
                          setDuration(v);
                        }}
                        className={
                          "flex-1 h-8 rounded text-[10px] font-mono " +
                          (duration === v ? "bg-cyan-400 text-black" : "bg-white/5")
                        }
                      >
                        {v}t
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  Stake
                </div>
                <Input
                  type="number"
                  min="0.35"
                  step="0.01"
                  value={stake}
                  onChange={function (e) {
                    setStake(Math.max(0.35, Number(e.target.value)));
                  }}
                  className="bg-black/20 border-white/10 font-mono"
                />
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2 text-[11px] font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Market</span>
                  <span>{symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contract</span>
                  <span>{labelFor(type, barrier)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ask</span>
                  <span>
                    {loading
                      ? "…"
                      : proposal?.ask_price != null
                        ? Number(proposal.ask_price).toFixed(2)
                        : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payout</span>
                  <span>{proposal?.payout != null ? Number(proposal.payout).toFixed(2) : "—"}</span>
                </div>
              </div>
              <Button
                onClick={buy}
                disabled={!proposal?.id || loading || status !== "open" || !!open}
                className="w-full h-11 bg-cyan-400 text-black hover:bg-cyan-300 font-bold"
              >
                {status === "open"
                  ? "BUY " + labelFor(type, barrier).toUpperCase()
                  : "CONNECT DERIV ACCOUNT"}
              </Button>
              <div className="text-[9px] text-muted-foreground leading-relaxed">
                Manual execution only. Sentinel intelligence informs the operator; it never buys
                automatically.
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function labelFor(type: ContractType, barrier: number) {
  if (type === "DIGITEVEN") return "Even";
  if (type === "DIGITODD") return "Odd";
  if (type === "DIGITOVER") return "Over " + barrier;
  if (type === "DIGITUNDER") return "Under " + barrier;
  if (type === "DIGITMATCH") return "Matches " + barrier;
  return "Differs " + barrier;
}
function Metric(props: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[.02] p-2">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
        {props.label}
      </div>
      <div className="mt-1 text-xs font-mono">{String(props.value)}</div>
    </div>
  );
}
function MiniChart(props: { ticks: any[] }) {
  const a = props.ticks;
  if (a.length < 2)
    return (
      <div className="h-full grid place-items-center text-xs text-muted-foreground">
        Waiting for live ticks…
      </div>
    );
  const lo = Math.min.apply(
    null,
    a.map(function (x) {
      return x.price;
    }),
  );
  const hi = Math.max.apply(
    null,
    a.map(function (x) {
      return x.price;
    }),
  );
  const span = Math.max(1e-9, hi - lo);
  const points = a
    .map(function (x, i) {
      return (i / (a.length - 1)) * 100 + "," + (30 - ((x.price - lo) / span) * 26);
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="w-full h-full">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth=".45"
        className="text-cyan-300"
        points={points}
      />
    </svg>
  );
}
