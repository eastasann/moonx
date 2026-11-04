import { Skeleton } from "@moonx/ui-web";
import type { ReactNode } from "react";
import { StandaloneFrame } from "./StandaloneFrame";
import { SlowLoadingState, useSlowRetry } from "./states";

/**
 * A screen without AppFrame while what it needs loads (design-spec 6.0.6「ローディング」):
 * the skeleton of its layout, and after 10 seconds "Taking longer than usual" and Retry,
 * which shows the skeleton again for another 10 seconds.
 *
 * @param since How long the load had run before this showed (a route's pending time).
 */
export function StandaloneLoading({
  onRetry,
  since = 0,
  children,
}: {
  /** Drops what the screen waits for and asks again (askAgain, dropRouteReads). */
  onRetry: () => void;
  since?: number;
  /** The screen's pattern with placeholder words, drawn as bars. */
  children: ReactNode;
}) {
  const { isSlow, retry } = useSlowRetry(true, onRetry, since);
  return (
    <StandaloneFrame>
      {isSlow ? (
        <SlowLoadingState onRetry={retry} />
      ) : (
        <Skeleton isLoading>{children}</Skeleton>
      )}
    </StandaloneFrame>
  );
}
