import Link from "next/link";
import { cn } from "@/lib/utils";
import { SignalIcon, SignalTier } from "@/components/dashboard/disposition/signal-tier";
import { TIER_DOCS } from "@/lib/dashboard/methodology-content";

export function SignalMethodology() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-5 py-8 lg:px-8 lg:py-10">
      <div className="space-y-2">
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-primary">
          How Foretab signals work
        </div>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.025em] text-foreground">
          Every license gets a signal tier.
        </h1>
        <p className="text-base leading-relaxed text-foreground-2">
          We read each license&apos;s public filing history and classify how actionable it is right
          now. Three tiers, one rule each — and every record shows its own reason inline.
        </p>
      </div>

      <div className="space-y-3.5">
        {TIER_DOCS.map((tier) => (
          <div key={tier.signal} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-3">
                <SignalTier signal={tier.signal} />
                <p className="text-sm leading-relaxed text-foreground-2">
                  <span className="font-medium text-foreground">Rule: </span>
                  {tier.rule}
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-foreground-muted">
                  {tier.salesContext}
                </p>
              </div>
              <div
                className={cn(
                  "shrink-0 rounded-lg p-3",
                  tier.signal === "Dormant" ? "bg-surface-2" : "bg-accent-tint",
                )}
              >
                <SignalIcon
                  signal={tier.signal}
                  className={cn(
                    "h-6 w-6",
                    tier.signal === "Dormant" ? "text-foreground-muted" : "text-primary",
                  )}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border-soft bg-surface-2 px-4 py-3.5 text-sm leading-relaxed text-foreground-2">
        Tiers come from official state filing records only — no scraping, no guesswork. Every record
        carries its own one-line reason so you see the specific basis, not just the label.
      </div>

      <div className="pt-2">
        <Link href="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          ← Back to worklist
        </Link>
      </div>
    </div>
  );
}
