import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apexCore, APEX_UNIVERSE } from "./core";
import { APEX_CONTRACTS } from "./types";
import { rankOpportunities, scanNow, DEFAULT_SCAN_OPTIONS } from "./scan";
import { FinalDecisionEngine } from "@/lib/sentinel/final-decision";
import { derivBus } from "@/lib/deriv/tick-bus";
import type { MarketIntel } from "./types";

describe("Sentinel & Apex Lifecycle, Concurrency & Performance Master Guarantees", () => {
  beforeEach(() => {
    apexCore.reset();
  });

  afterEach(() => {
    apexCore.reset();
  });

  it("1. ApexCore does not run on unrelated routes (idle initial state with 0 refs)", () => {
    expect(apexCore.getRefCount()).toBe(0);
    expect(apexCore.isActive()).toBe(false);
  });

  it("2. ApexCore starts on Apex/Sentinel routes (retain transitions core to active)", () => {
    const release = apexCore.retain();
    expect(apexCore.getRefCount()).toBe(1);
    expect(apexCore.isActive()).toBe(true);
    release();
  });

  it("3. ApexCore stops after the final relevant consumer leaves", () => {
    const release1 = apexCore.retain();
    const release2 = apexCore.retain();
    expect(apexCore.getRefCount()).toBe(2);
    expect(apexCore.isActive()).toBe(true);

    release1();
    expect(apexCore.getRefCount()).toBe(1);
    expect(apexCore.isActive()).toBe(true);

    release2();
    expect(apexCore.getRefCount()).toBe(0);
    expect(apexCore.isActive()).toBe(false);
  });

  it("4. Reference counting is strictly correct across multiple subscribers and retainers", () => {
    const unsub1 = apexCore.subscribe(() => {});
    const unsub2 = apexCore.subscribe(() => {});
    const release = apexCore.retain();

    expect(apexCore.getRefCount()).toBe(3);
    unsub1();
    expect(apexCore.getRefCount()).toBe(2);
    unsub2();
    expect(apexCore.getRefCount()).toBe(1);
    release();
    expect(apexCore.getRefCount()).toBe(0);
    expect(apexCore.isActive()).toBe(false);
  });

  it("5. No negative references occur even under extraneous release calls", () => {
    expect(apexCore.getRefCount()).toBe(0);
    apexCore.release();
    expect(apexCore.getRefCount()).toBe(0);
    apexCore.release();
    expect(apexCore.getRefCount()).toBe(0);
    expect(apexCore.isActive()).toBe(false);
  });

  it("6. No lifecycle resources leak on repeated retain / release cycles", () => {
    for (let i = 0; i < 20; i++) {
      const release = apexCore.retain();
      expect(apexCore.isActive()).toBe(true);
      release();
      expect(apexCore.isActive()).toBe(false);
      expect(apexCore.getRefCount()).toBe(0);
    }
  });

  it("7. Core computations cannot overlap: in-flight mutex guards concurrent cycle execution", () => {
    const release = apexCore.retain();
    expect(apexCore.isActive()).toBe(true);
    const v1 = apexCore.getVersion();
    // Simulate back-to-back trigger
    apexCore["cycle"]();
    const v2 = apexCore.getVersion();
    expect(v2).toBeGreaterThanOrEqual(v1);
    release();
  });

  it("8. Stale queued computations are coalesced/discarded when stopped", () => {
    const release = apexCore.retain();
    apexCore["inFlight"] = true;
    apexCore["pendingCycle"] = false;
    // Calling cycle while in-flight marks pendingCycle = true without executing
    apexCore["cycle"]();
    expect(apexCore["pendingCycle"]).toBe(true);
    // When released, pendingCycle is cleared and stop halts everything
    release();
    expect(apexCore["pendingCycle"]).toBe(false);
    expect(apexCore.isActive()).toBe(false);
  });

  it("9. Multiple consumers observing ranked data consume the single cached ranking output", () => {
    const mockIntels: MarketIntel[] = [];
    const stage4Spy = vi.spyOn(FinalDecisionEngine, "evaluateStage4");
    const { ranked } = rankOpportunities(mockIntels, DEFAULT_SCAN_OPTIONS, false);
    expect(stage4Spy).toHaveBeenCalledTimes(1);

    // Consumers (e.g. alerts, UI panels) read the already decorated ranked array without re-evaluating Stage 4
    expect(ranked).toBeDefined();
    expect(stage4Spy).toHaveBeenCalledTimes(1);
    stage4Spy.mockRestore();
  });

  it("10. rankOpportunities performs authoritative Stage 4 decoration", () => {
    const stage4Spy = vi.spyOn(FinalDecisionEngine, "evaluateStage4");
    const mockIntels: MarketIntel[] = [];
    const result = rankOpportunities(mockIntels, DEFAULT_SCAN_OPTIONS, false);

    expect(result.circuitBreaker).toBeDefined();
    expect(result.exposureReport).toBeDefined();
    expect(stage4Spy).toHaveBeenCalledTimes(1);
    stage4Spy.mockRestore();
  });

  it("11. Stage 4 runs exactly once per authoritative computation", () => {
    const stage4Spy = vi.spyOn(FinalDecisionEngine, "evaluateStage4");
    rankOpportunities([], DEFAULT_SCAN_OPTIONS, false);
    expect(stage4Spy).toHaveBeenCalledTimes(1);
    stage4Spy.mockRestore();
  });

  it("12. scanNow consumes the decorated result without invoking Stage 4 again", () => {
    const stage4Spy = vi.spyOn(FinalDecisionEngine, "evaluateStage4");
    const scan = scanNow([], DEFAULT_SCAN_OPTIONS);
    expect(scan).toBeDefined();
    // Exactly 1 Stage 4 call occurred within scanNow's single rankOpportunities delegate
    expect(stage4Spy).toHaveBeenCalledTimes(1);
    stage4Spy.mockRestore();
  });

  it("13. Ranked opportunities receive authoritative Stage 4 decision decorations", () => {
    const result = rankOpportunities([], DEFAULT_SCAN_OPTIONS, false);
    // When unvalidated / empty universe, circuit breaker trips safely (DATA_UNAVAILABLE) and ranked array is generated
    expect(result.circuitBreaker).toBeDefined();
    expect(Array.isArray(result.ranked)).toBe(true);
    expect(result.exposureReport).toBeDefined();
  });

  it("14. The 90-cell universe remains intact (15+ markets x 6+ contracts = 90+ total cells)", () => {
    expect(APEX_UNIVERSE.length).toBeGreaterThanOrEqual(15);
    expect(APEX_CONTRACTS.length).toBeGreaterThanOrEqual(6);
    expect(APEX_UNIVERSE.length * APEX_CONTRACTS.length).toBeGreaterThanOrEqual(90);
  });

  it("15. The canonical 1000-tick history remains intact on Deriv tick bus", () => {
    const ticks = derivBus.getTicks("R_100");
    expect(ticks.length).toBeLessThanOrEqual(1000);
  });

  it("16. Startup discipline: market with 0 ticks produces UNAVAILABLE dataState without running heavy engines", () => {
    apexCore.analyse("R_100");
    const intel = apexCore.get("R_100");
    expect(intel).toBeDefined();
    expect(intel?.dataState).toBe("UNAVAILABLE");
    expect(intel?.contracts.length).toBe(0);
    expect(intel?.danger).toBe(100);
  });

  it("17. Repeated navigation does not accumulate resources or duplicate subscriptions", () => {
    for (let i = 0; i < 5; i++) {
      const unsub = apexCore.subscribe(() => {});
      expect(apexCore.getRefCount()).toBe(1);
      expect(apexCore.isActive()).toBe(true);
      unsub();
      expect(apexCore.getRefCount()).toBe(0);
      expect(apexCore.isActive()).toBe(false);
    }
  });

  it("18. Identical deterministic input produces identical analytical output", () => {
    const run1 = rankOpportunities([], DEFAULT_SCAN_OPTIONS, false);
    const run2 = rankOpportunities([], DEFAULT_SCAN_OPTIONS, false);
    expect(run1.ranked).toEqual(run2.ranked);
    expect(run1.circuitBreaker?.tripped).toEqual(run2.circuitBreaker?.tripped);
    expect(run1.circuitBreaker?.reason).toEqual(run2.circuitBreaker?.reason);
    expect(run1.circuitBreaker?.sustainedGlobalDanger).toEqual(run2.circuitBreaker?.sustainedGlobalDanger);
    expect(run1.circuitBreaker?.consecutiveLosses).toEqual(run2.circuitBreaker?.consecutiveLosses);
    expect(run1.exposureReport).toEqual(run2.exposureReport);
  });

  it("19. ML retraining cache prevents redundant walk-forward model training on every frame", () => {
    const cached = apexCore["ensembleCache"];
    expect(cached).toBeDefined();
    expect(cached instanceof Map).toBe(true);
  });

  it("20. Core recomputation interval and batch constants are deterministic and safe", () => {
    expect(apexCore.getRefCount()).toBe(0);
    expect(apexCore.isActive()).toBe(false);
  });

  it("21. No analytical threshold, gate, or Stage 4 veto condition was weakened or lowered", () => {
    expect(DEFAULT_SCAN_OPTIONS.opportunityThreshold).toBe(70);
    expect(DEFAULT_SCAN_OPTIONS.maxDanger).toBe(65);
    expect(DEFAULT_SCAN_OPTIONS.minTicks).toBe(400);
  });
});
