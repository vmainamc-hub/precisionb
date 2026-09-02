import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { startApexCloudSync, stopApexCloudSync } from "@/lib/apex/cloud";
import { startJournalSync } from "@/lib/apex/journal";
import { startFeedbackSync, stopFeedbackSync } from "@/lib/sentinel/feedback-cloud";

// Auth gate disabled — app is publicly accessible.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AppShell,
});

/**
 * AppShell manages application-wide persistence and sync.
 * ApexCore is NOT retained globally here; its lifecycle is route-scoped so that
 * continuous multi-market analysis runs ONLY when Sentinel / Apex is active.
 */
function AppShell() {
  useEffect(() => {
    // Durable, per-market persistence of everything Sentinel learns. Falls back
    // to local-only learning (and reports it) when nobody is signed in.
    void startApexCloudSync();
    void startJournalSync();
    // Operator feedback (marked trades + written observations) is mirrored to
    // the signed-in operator's own rows so it survives reload and device change.
    void startFeedbackSync();

    return () => {
      stopApexCloudSync();
      stopFeedbackSync();
    };
  }, []);
  return <Outlet />;
}
