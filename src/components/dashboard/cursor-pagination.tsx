"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Cursor pagination — Next button only (no "previous" since cursor
 * pagination doesn't easily support back without storing a history
 * stack). "Back to top" link returns to page 1.
 *
 * Client component because it reads useSearchParams to construct the
 * next URL with the same filters + new cursor.
 */
export function CursorPagination({ nextCursor }: { nextCursor: string | null }) {
  const searchParams = useSearchParams();

  if (!nextCursor) {
    return (
      <div className="flex items-center justify-center pt-4 text-sm text-muted-foreground">
        End of feed.
      </div>
    );
  }

  const params = new URLSearchParams();
  searchParams.forEach((v, k) => {
    if (k !== "cursor") params.set(k, v);
  });
  params.set("cursor", nextCursor);

  return (
    <div className="flex items-center justify-between pt-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/">← Back to top</Link>
      </Button>
      <Button asChild size="sm">
        <Link href={`/?${params.toString()}`}>Load more →</Link>
      </Button>
    </div>
  );
}
