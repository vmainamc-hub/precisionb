import { APEX_UNIVERSE_SYMBOLS } from "@/lib/apex/universe";
import type { Parity } from "./types";
import { cellIdFor, emptyCellState, snapshotCell, type MutableParity30State } from "./cell";

const PARITIES: readonly Parity[] = ["EVEN", "ODD"];

export const PARITY_MARKETS = Object.freeze([...APEX_UNIVERSE_SYMBOLS]);
export const PARITY_CELL_COUNT = PARITY_MARKETS.length * 2;

export class Parity30Registry {
  private readonly cells = new Map<string, MutableParity30State>();
  private readonly identities = new Map<string, { cellId: string; marketId: string; parity: Parity; index: number }>();

  constructor() {
    let index = 0;
    for (const marketId of PARITY_MARKETS) {
      for (const parity of PARITIES) {
        const cellId = cellIdFor(marketId, parity);
        this.identities.set(cellId, Object.freeze({ cellId, marketId, parity, index: index++ }));
        this.cells.set(cellId, emptyCellState());
      }
    }
  }

  ensureAll() {
    return this.identities.size === PARITY_CELL_COUNT;
  }

  identity(marketId: string, parity: Parity) {
    const id = cellIdFor(marketId, parity);
    const identity = this.identities.get(id);
    if (!identity) throw new Error(`Unknown parity cell: ${id}`);
    return identity;
  }

  state(marketId: string, parity: Parity) {
    const id = cellIdFor(marketId, parity);
    const state = this.cells.get(id);
    if (!state) throw new Error(`Unknown parity cell: ${id}`);
    return state;
  }

  getAllIdentities() { return Object.freeze([...this.identities.values()]); }

  getAllSnapshots() {
    return Object.freeze([...this.identities.values()].map((identity) => {
      const state = this.cells.get(identity.cellId)!;
      return snapshotCell(identity, state, { evidence: 0, psychology: 50, persistence: 0, regime: 50, statistical: 0, danger: 50, freshness: 100 });
    }));
  }

  reset() {
    for (const id of this.identities.keys()) this.cells.set(id, emptyCellState());
  }
}
