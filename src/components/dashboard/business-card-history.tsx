"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";

type HistoryRecord = {
  id: string;
  license_record_type: string | null;
  sort_date: string | null;
  customer_status: string | null;
};

export function BusinessCardHistory({ records }: { records: HistoryRecord[] }) {
  const [open, setOpen] = useState(false);
  const label = records.length === 1 ? "1 more on file" : `${records.length} more on file`;

  return (
    <div className="border-t border-border-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.06em] text-foreground-muted transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        <span
          className="inline-block transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        >
          ▾
        </span>
        {label}
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border-soft px-5 pb-4 pt-2.5">
          {records.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {r.license_record_type ? (
                  <Badge variant="outline" className="capitalize text-[11px]">
                    {r.license_record_type.replace(/_/g, " ")}
                  </Badge>
                ) : null}
                {r.customer_status && r.customer_status !== "Active" ? (
                  <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-foreground-muted">
                    {r.customer_status}
                  </span>
                ) : null}
                {r.sort_date ? (
                  <span className="font-mono text-[11px] text-foreground-muted">
                    {new Date(r.sort_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
