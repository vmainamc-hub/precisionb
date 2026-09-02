import React from "react";

export function SectionTitle({
  children,
  hint,
  className = "",
}: {
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`mb-2 flex flex-wrap items-baseline justify-between gap-2 ${className}`}>
      <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">
        {children}
      </h3>
      {hint && (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  );
}

export function EvidenceList({
  items,
  tone = "neutral",
  empty = "No evidence available.",
  className = "",
}: {
  items: string[];
  tone?: "support" | "conflict" | "neutral" | string;
  empty?: string;
  className?: string;
}) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{empty}</p>;
  }

  const dotColor =
    tone === "support"
      ? "var(--bull)"
      : tone === "conflict"
        ? "var(--bear)"
        : "var(--neon)";

  return (
    <ul className={`space-y-1.5 ${className}`}>
      {items.map((item, idx) => (
        <li key={idx} className="flex items-start gap-2 text-xs text-foreground/85">
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          <span className="leading-snug">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function EvidencePanel({
  title = "Evidence Panel",
  hint,
  items,
  tone = "neutral",
  empty,
}: {
  title?: string;
  hint?: string;
  items: string[];
  tone?: "support" | "conflict" | "neutral";
  empty?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-4">
      <SectionTitle hint={hint}>{title}</SectionTitle>
      <EvidenceList items={items} tone={tone} empty={empty} />
    </div>
  );
}
