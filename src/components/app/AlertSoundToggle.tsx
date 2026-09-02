import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isAlertAudioUnlocked, primeAlertAudio } from "@/hooks/useAlertSound";

/**
 * Browsers block audio until a real click happens inside the page (and inside
 * the preview iframe). This control performs that gesture, plays a test chime
 * so the operator can confirm the sound, and shows whether alerts are audible.
 */
export function AlertSoundToggle() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setReady(isAlertAudioUnlocked()), 1000);
    setReady(isAlertAudioUnlocked());
    return () => clearInterval(id);
  }, []);

  return (
    <button
      type="button"
      onClick={async () => setReady(await primeAlertAudio(true))}
      title={
        ready
          ? "Alert sound is enabled — click to replay the test chime"
          : "Click to enable signal alert sound"
      }
      className={
        "h-8 px-2.5 rounded-md border text-[11px] flex items-center gap-1.5 " +
        (ready
          ? "border-[var(--bull)]/50 text-[var(--bull)] bg-[var(--bull)]/10"
          : "border-[var(--warn)]/60 text-[var(--warn)] bg-[var(--warn)]/10 animate-pulse")
      }
    >
      {ready ? <Volume2 size={12} /> : <VolumeX size={12} />}
      <span className="hidden sm:inline uppercase tracking-widest">
        {ready ? "Alerts on" : "Enable sound"}
      </span>
    </button>
  );
}
