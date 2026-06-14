/**
 * Offset-based cursor for the RPC pagination path.
 *
 * The existing keyset cursor (cursor.ts) encodes { s, i } and is used
 * by the direct-PostgREST path. The RPC path uses offset pagination
 * (p_offset: number), so it needs its own cursor encoding: { o: number }.
 *
 * The two formats are intentionally incompatible — decodeCursor() returns
 * null for RPC-format cursors (no "s" key), so old keyset cursors in URLs
 * fall back to page 1 gracefully when the flag flips, and vice versa.
 */

export function encodeRpcCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

export function decodeRpcOffset(encoded: string | null | undefined): number {
  if (!encoded) return 0;
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "o" in parsed &&
      typeof (parsed as Record<string, unknown>).o === "number"
    ) {
      const o = (parsed as Record<string, unknown>).o as number;
      if (o >= 0) return o;
    }
  } catch {}
  return 0;
}
