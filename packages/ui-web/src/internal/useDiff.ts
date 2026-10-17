import { useEffect, useState } from "react";
import { type DiffPart, diffNow, waitForDiff } from "./diff";

/**
 * The parts of the change from `before` to `after`, or null while a long rewrite is still
 * being worked out a frame at a time (design-spec 4.5 DiffText). A diff of a few changes
 * is done at once.
 */
export function useDiff(before: string, after: string): DiffPart[] | null {
  // The parts it waited for are kept here: the shared cache may have let them go by the
  // next render.
  const [waited, setWaited] = useState<{
    before: string;
    after: string;
    parts: DiffPart[];
  } | null>(null);
  const parts =
    waited?.before === before && waited.after === after
      ? waited.parts
      : diffNow(before, after);
  useEffect(() => {
    if (parts !== null) return;
    return waitForDiff(before, after, (done) =>
      setWaited({ before, after, parts: done }),
    );
  }, [before, after, parts]);
  return parts;
}
