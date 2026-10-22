import { useIsDesktop } from "@moonx/ui-web";
import { useEffect, useRef, useState } from "react";

/**
 * Keeps the item a list shows beside itself without its being chosen (its first) when a
 * docked panel narrows the body to one pane on a desktop (design-spec 4.1: what was
 * selected stays as the arrangement changes). Returns that item while nothing is
 * chosen, so it stays on screen at once in place of the list, and has `keep` write it
 * into the URL. A window made narrower than a desktop takes the narrow arrangement, the
 * list first, as a phone or tablet opens it.
 *
 * @param shownId The item shown beside the list while it stands in two columns and
 *   nothing is chosen, else undefined.
 * @param chosenId The item the URL chooses, if any.
 */
export function useKeepShownItem(
  isTwoColumns: boolean,
  shownId: string | undefined,
  chosenId: string | undefined,
  keep: (id: string) => void,
): string | undefined {
  const isDesktop = useIsDesktop();
  // Set while rendering, so the item stays in the render where the arrangement changes.
  const [shown, setShown] = useState<string | undefined>(undefined);
  const next =
    chosenId !== undefined || !isDesktop
      ? undefined
      : isTwoColumns
        ? shownId
        : shown;
  if (next !== shown) setShown(next);
  const kept = !isTwoColumns ? next : undefined;
  const latestKeep = useRef(keep);
  latestKeep.current = keep;
  useEffect(() => {
    if (kept !== undefined) latestKeep.current(kept);
  }, [kept]);
  return kept;
}
