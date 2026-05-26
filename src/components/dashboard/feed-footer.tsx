import { Button } from "@/components/ui/button";

/**
 * Feed footer: total count + CSV export placeholder + Terms link.
 *
 * CSV export is Task 17 — disabled placeholder for now. The button is
 * present so customers see the affordance during trial; clicking shows
 * the "coming soon" state in the title attribute.
 *
 * Terms link points at /terms (route doesn't exist yet — Claude Design's
 * marketing-site work). The link is still useful as a placeholder
 * affordance + accessibility audit signal that we surface Terms
 * somewhere in the authenticated UI.
 */
export function FeedFooter({ totalCount }: { totalCount: number | null }) {
  return (
    <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-input pt-4 text-sm text-muted-foreground">
      <div>
        {totalCount === null
          ? "Loading count…"
          : totalCount === 1
            ? "1 record"
            : `${totalCount.toLocaleString()} records`}
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled
          title="CSV export is coming with Task 17. For now you can email hi@foretab.com to request an export."
        >
          Export CSV (soon)
        </Button>
        <a
          href="https://foretab.com/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Terms
        </a>
      </div>
    </footer>
  );
}
