"use client";

import * as React from "react";
import type { DispositionStatus } from "@/lib/disposition/types";
import type { StatusTabValue } from "./status-tabs";

interface StatusCountsCtx {
  counts: Partial<Record<StatusTabValue, number>>;
  onStatusChange: (from: DispositionStatus, to: DispositionStatus) => void;
}

const StatusCountsContext = React.createContext<StatusCountsCtx>({
  counts: {},
  onStatusChange: () => {},
});

/**
 * Wraps the dashboard page and provides optimistic tab count updates.
 * Initialized from the server-rendered counts; onStatusChange adjusts
 * them in place when a disposition status changes. This way the tab
 * strip (Saved(3), Working(5)…) reflects changes instantly without
 * waiting for a full RSC re-render.
 */
export function StatusCountsProvider({
  initialCounts,
  children,
}: {
  initialCounts: Partial<Record<StatusTabValue, number>>;
  children: React.ReactNode;
}) {
  const [counts, setCounts] = React.useState(initialCounts);

  const onStatusChange = React.useCallback(
    (from: DispositionStatus, to: DispositionStatus) => {
      if (from === to) return;
      setCounts((prev) => {
        const next = { ...prev };
        // Decrement old bucket (guard against going below 0)
        const fromKey = from as StatusTabValue;
        if (prev[fromKey] !== undefined) {
          next[fromKey] = Math.max(0, (prev[fromKey] ?? 0) - 1);
        }
        // Increment new bucket
        const toKey = to as StatusTabValue;
        next[toKey] = (prev[toKey] ?? 0) + 1;
        return next;
      });
    },
    [],
  );

  return (
    <StatusCountsContext.Provider value={{ counts, onStatusChange }}>
      {children}
    </StatusCountsContext.Provider>
  );
}

export function useStatusCounts() {
  return React.useContext(StatusCountsContext);
}
