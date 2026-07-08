import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize a raw ?next= value to prevent open-redirect attacks.
 * Accepts only same-site paths: a single leading "/" that is NOT followed
 * by a second "/" (which would be treated as a protocol-relative URL by
 * Next.js redirect()). Returns "/" for anything else.
 */
export function safeNextPath(raw: string): string {
  return /^\/(?!\/)/.test(raw) ? raw : "/";
}
