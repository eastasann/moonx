import { createHash } from "node:crypto";

/**
 * A UUID derived from the parts, so every seeded row has the same id on every run. Fixtures and
 * end-to-end tests can name rows without looking them up.
 */
export function uid(...parts: string[]): string {
  const hex = createHash("sha256").update(parts.join("|")).digest("hex");
  const variant = ((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
