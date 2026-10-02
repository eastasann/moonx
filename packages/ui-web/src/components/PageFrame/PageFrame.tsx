import type { ReactNode } from "react";

export interface PageFrameProps {
  /** Shows the page inside another page, as the component gallery does: a plain `div`, not the `main` landmark. */
  isEmbedded?: boolean;
  children: ReactNode;
}

/**
 * The `main` landmark of a screen that has no `AppFrame`: the landing page, log in and the other
 * public screens, and onboarding. It adds no layout; the layout pattern inside it does.
 */
export function PageFrame({ isEmbedded = false, children }: PageFrameProps) {
  return isEmbedded ? <div>{children}</div> : <main id="main-content">{children}</main>;
}
