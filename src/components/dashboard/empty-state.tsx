import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Two flavors of empty:
 *   - "no records ever" — customer has access but their state(s) haven't
 *     surfaced any classified records yet (first-day-of-trial,
 *     under-classified-state). Message: data will appear as it lands.
 *   - "no matches" — filters are too narrow. Message: clear filters CTA.
 */
export function EmptyState({
  reason,
}: {
  reason: "no_records" | "no_matches";
}) {
  if (reason === "no_matches") {
    return (
      <Card>
        <CardContent className="space-y-2 p-8 text-center">
          <h3 className="text-base font-semibold">No records match your filters</h3>
          <p className="text-sm text-muted-foreground">
            Try widening your date window or removing a filter.{" "}
            <Link href="/" className="text-primary hover:underline">
              Clear all filters
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-8 text-center">
        <h3 className="text-base font-semibold">Your data will appear here</h3>
        <p className="text-sm text-muted-foreground">
          New license records land in your feed as they&apos;re classified.
          Most states refresh daily; a few refresh weekly or through public-records
          requests. If you don&apos;t see anything within 24 hours, email{" "}
          <a href="mailto:hi@foretab.com" className="text-primary hover:underline">
            hi@foretab.com
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}
