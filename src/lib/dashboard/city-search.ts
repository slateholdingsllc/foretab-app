"use server";

import { createClient } from "@/lib/supabase/server";
import { rpcEnforced } from "@/lib/rpc/flag";

/**
 * Type-ahead city lookup scoped to the customer's accessible states (via RLS
 * on locations) and optionally narrowed to their currently-selected states.
 *
 * Requires at least 2 characters — avoids wide full-table scans on short
 * prefixes. Returns up to 8 distinct city names.
 *
 * RLS on locations returns only rows linked to classified_records the
 * customer can see (migration 016), so no extra auth check needed here.
 */
export async function searchCities(
  term: string,
  selectedStates: string[],
): Promise<string[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();

  if (rpcEnforced()) {
    const { data, error } = await supabase.rpc("search_cities", {
      p_term: trimmed,
      p_state_codes: selectedStates.length > 0 ? selectedStates : null,
    });
    if (error || !data) return [];
    const seen = new Set<string>();
    const cities: string[] = [];
    for (const r of data as Array<string | { city: string | null }>) {
      const city = typeof r === "string" ? r : r.city;
      if (city && !seen.has(city)) {
        seen.add(city);
        cities.push(city);
      }
    }
    return cities;
  }

  // biome-ignore lint/suspicious/noExplicitAny: supabase query chain
  let q: any = supabase
    .from("locations")
    .select("city")
    .ilike("city", `${trimmed}%`)
    .not("city", "is", null)
    .order("city")
    .limit(8);

  if (selectedStates.length > 0) {
    q = q.in("state_code", selectedStates);
  }

  const { data, error } = await q;
  if (error || !data) return [];

  const seen = new Set<string>();
  const cities: string[] = [];
  for (const r of data as Array<{ city: string | null }>) {
    if (r.city && !seen.has(r.city)) {
      seen.add(r.city);
      cities.push(r.city);
    }
  }
  return cities;
}
