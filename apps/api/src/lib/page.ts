import { ApiError } from "../errors";

const MAX_OFFSET = 1_000_000;

/** Cursors are opaque to clients; here they are an offset into the already-sorted result. */
function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}

/** The offset a cursor stands for (0 without one). A malformed cursor is a 422. */
export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Number.isInteger(parsed?.o) && parsed.o >= 0 && parsed.o <= MAX_OFFSET) return parsed.o;
  } catch {}
  throw new ApiError("VALIDATION_FAILED", "cursor: invalid", {
    details: [{ path: "cursor", code: "invalid_value", message: "Invalid cursor" }],
  });
}

/** Cuts `items` (fetched with `limit + 1`) into a page and the cursor of the next one. */
export function toPage<T>(items: T[], offset: number, limit: number) {
  const hasMore = items.length > limit;
  return {
    items: hasMore ? items.slice(0, limit) : items,
    nextCursor: hasMore ? encodeCursor(offset + limit) : null,
  };
}
