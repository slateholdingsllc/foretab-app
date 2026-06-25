import { cn } from "@/lib/utils";
import { SignalIcon } from "@/components/dashboard/disposition/signal-tier";
import {
  METHODOLOGY_FOOTNOTE,
  METHODOLOGY_KICKER,
  METHODOLOGY_LEDE,
  METHODOLOGY_TIERS,
  METHODOLOGY_TITLE,
} from "@/lib/dashboard/methodology-content";

/**
 * SignalMethodology — the one-screen "How Foretab signals work" explainer.
 *
 * The transparency surface: the inline signal_strength_reason answers "why is
 * THIS license New?"; this answers "what does New even mean, and can I trust
 * it?". Reuses the shipped broadcast-node SignalIcon + tier language so it
 * reads identically to every signal badge in the app.
 *
 * Mount anywhere — it's self-contained card content:
 *   - as the /methodology route body (full page)
 *   - inside a modal/popover off the signal legend (`compact` trims the lede)
 *
 * Theme: semantic tokens only — flips via [data-theme]. No `dark:` variants.
 */
export function SignalMethodology({
  compact = false,
  className,
}: {
  /** Trims the hero lede + footnote for modal use. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="border-b border-border px-6 py-6 sm:px-7">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.1em] text-primary">
          {METHODOLOGY_KICKER}
        </div>
        <h1 className="text-[clamp(20px,2.4vw,26px)] font-semibold leading-tight tracking-[-0.025em] text-foreground">
          {METHODOLOGY_TITLE}
        </h1>
        {!compact ? (
          <p className="mt-2.5 max-w-prose text-[15px] leading-relaxed text-foreground-2">
            {METHODOLOGY_LEDE}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
        {METHODOLOGY_TIERS.map((t) => (
          <div key={t.tier} className="flex flex-col bg-card px-5 py-5">
            <div className="mb-2.5 flex items-center gap-2">
              <SignalIcon signal={t.tier} className="h-4 w-4 text-primary" />
              <span className="font-mono text-[12px] font-medium uppercase tracking-[0.05em] text-foreground">
                {t.tier}
              </span>
            </div>
            <p className="flex-1 text-[13px] leading-relaxed text-muted-foreground">{t.rule}</p>
            <p className="mt-2.5 border-t border-border-soft pt-2.5 text-[13px] leading-relaxed text-foreground-2">
              <span className="font-medium text-foreground">Why a rep acts —</span>{" "}
              {t.act}
            </p>
          </div>
        ))}
      </div>

      {!compact ? (
        <p className="px-6 py-5 text-[13px] leading-relaxed text-muted-foreground sm:px-7">
          {METHODOLOGY_FOOTNOTE}
        </p>
      ) : null}
    </div>
  );
}
