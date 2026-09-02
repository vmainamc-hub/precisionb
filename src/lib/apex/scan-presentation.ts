import type { RankedOpportunity, ScanResult } from "./types";

/**
 * SINGLE OPERATOR SURFACE CANDIDATE.
 *
 * `finalRank` remains the authoritative strength ranking. The operator-facing
 * candidate is the first survivor of the mandatory surface gate, in that same
 * order. Scan never falls back to qualified/top/ranked subsets.
 */
export function selectScanCandidate(
  scan: ScanResult | null | undefined,
  liveRanked: readonly RankedOpportunity[] = [],
  liveSurfaced: RankedOpportunity | null = null,
): RankedOpportunity | null {
  // The continuous live surface is the source of truth. A completed scan also
  // carries the same surface result for audit, but it must not freeze the UI.
  if (liveSurfaced) return liveSurfaced;
  if (scan?.surfacedOpportunity) return scan.surfacedOpportunity;
  if (liveRanked.length) return null;
  return null;
}
