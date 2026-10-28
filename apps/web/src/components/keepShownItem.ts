import { useIsDesktop, useTwoColumnsNow } from "@moonx/ui-web";
import { useRouter, useRouterState } from "@tanstack/react-router";
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
  // The navigation that docks a panel renders once as two columns before the panel's
  // column is measured: what that render would put beside the list was never on screen
  // (Forward onto a list standing alone beside its panel). So the item to keep is taken
  // from two columns as laid out, once a render has committed.
  const isTwoColumnsNow = useTwoColumnsNow();
  const latestTwoColumnsNow = useRef(isTwoColumnsNow);
  latestTwoColumnsNow.current = isTwoColumnsNow;
  const [shown, setShown] = useState<string | undefined>(undefined);
  // Back and Forward restore an entry as it was left, what it had beside the list in its
  // URL: the item the entry before showed is not carried to it (Forward onto the list
  // that ← left alone beside its panel). It is taken again once the entry has rendered,
  // where two columns are laid out (a modal closed by going back).
  const router = useRouter();
  useEffect(
    () =>
      router.history.subscribe(({ action }) => {
        if (action.type !== "PUSH" && action.type !== "REPLACE") {
          setShown(undefined);
        }
      }),
    [router],
  );
  const entry = useRouterState({
    select: (state) =>
      state.resolvedLocation?.state.__TSR_key ?? state.resolvedLocation?.href,
  });
  const isReset = chosenId !== undefined || !isDesktop;
  if (isReset && shown !== undefined) setShown(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `entry` only says when to look again: each entry the router settles on, after Back and Forward too.
  useEffect(() => {
    if (!isReset && isTwoColumns && latestTwoColumnsNow.current()) {
      setShown(shownId);
    }
  }, [isReset, isTwoColumns, shownId, entry]);
  const kept = !isReset && !isTwoColumns ? shown : undefined;
  const latestKeep = useRef(keep);
  latestKeep.current = keep;
  useEffect(() => {
    // Not while the render is a frame behind a panel closed: two columns again show it.
    if (kept !== undefined && !latestTwoColumnsNow.current()) {
      latestKeep.current(kept);
    }
  }, [kept]);
  return kept;
}
