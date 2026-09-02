import { useEffect, useSyncExternalStore } from "react";
import { derivBus } from "@/lib/deriv/tick-bus";
import { APEX_UNIVERSE_SYMBOLS } from "@/lib/apex/universe";
import { parity30Runtime } from "@/lib/parity/runtime";

export function useParity30() {
  const version = useSyncExternalStore(
    (cb) => parity30Runtime.subscribe(cb),
    () => parity30Runtime.getVersion(),
    () => 0,
  );

  useEffect(() => {
    parity30Runtime.start();
    const unsubTick = derivBus.onTick((symbol) => {
      if (APEX_UNIVERSE_SYMBOLS.includes(symbol)) parity30Runtime.schedule(symbol, 300);
    });
    const unsubHistory = derivBus.onHistory((symbol) => {
      if (APEX_UNIVERSE_SYMBOLS.includes(symbol)) parity30Runtime.schedule(symbol, 0);
    });
    const unsubStatus = derivBus.onStatus(() => parity30Runtime.schedule(undefined, 500));
    const unsubscribe = derivBus.subscribe([...APEX_UNIVERSE_SYMBOLS]);
    parity30Runtime.schedule(undefined, 0);
    return () => {
      unsubTick();
      unsubHistory();
      unsubStatus();
      unsubscribe();
      parity30Runtime.stop();
    };
  }, []);

  return parity30Runtime.getView();
}
