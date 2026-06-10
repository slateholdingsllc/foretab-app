import type { CursorPayload } from "./types";

/**
 * URL-safe cursor encoding. Base64URL of JSON {c, i} — small enough to
 * fit in a URL search param, opaque to the caller.
 *
 * We don't sign the cursor — it's not security-sensitive (RLS still
 * enforces what the customer can see regardless of what cursor they
 * pass). If a malicious customer crafts a cursor, the worst they do
 * is skip pages or paginate inefficiently.
 */

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor(encoded: string | null | undefined): CursorPayload | null {
  if (!encoded) return null;
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("s" in parsed) ||
      !("i" in parsed) ||
      typeof (parsed as Record<string, unknown>).s !== "string" ||
      typeof (parsed as Record<string, unknown>).i !== "string"
    ) {
      return null;
    }
    const p = parsed as Record<string, unknown>;
    return { s: p.s as string, i: p.i as string };
  } catch {
    return null;
  }
}
