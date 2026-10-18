import { Skeleton } from "@moonx/ui-web";
import type { ReactNode } from "react";
import { StandaloneFrame } from "./StandaloneFrame";
import { SlowLoadingState, useIsSlow } from "./states";

/**
 * A screen without AppFrame while what it needs loads (design-spec 6.0.6「ローディング」):
 * the skeleton of its layout, and after 10 seconds "Taking longer than usual" and Retry.
 *
 * @param since How long the load had run before this showed (a route's pending time).
 */
export function StandaloneLoading({
  onRetry,
  since = 0,
  children,
}: {
  onRetry: () => void;
  since?: number;
  /** The screen's pattern with placeholder words, drawn as bars. */
  children: ReactNode;
}) {
  const isSlow = useIsSlow(true, since);
  return (
    <StandaloneFrame>
      {isSlow ? (
        <SlowLoadingState onRetry={onRetry} />
      ) : (
        <Skeleton isLoading>{children}</Skeleton>
      )}
    </StandaloneFrame>
  );
}
