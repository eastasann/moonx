import type { ReactNode } from "react";
import { preformatted, well } from "./Well.css";

interface WellBaseProps {
  children: ReactNode;
}

type Unnamed = { "aria-label"?: undefined; "aria-labelledby"?: undefined };
type Named =
  | { "aria-label": string; "aria-labelledby"?: undefined }
  | { "aria-label"?: undefined; "aria-labelledby": string };

/**
 * A name is optional; when given, the well becomes a labelled group. `preformatted` shows `children`
 * (a string) as it is written, in the monospace face, and scrolls it inside the well: the name is
 * required then, because a scrolling region needs one.
 */
export type WellProps = WellBaseProps &
  ((Unnamed & { preformatted?: false }) | (Named & { preformatted?: boolean }));

export function Well({ children, preformatted: isPreformatted, ...aria }: WellProps) {
  const named = aria["aria-label"] !== undefined || aria["aria-labelledby"] !== undefined;
  return (
    <div {...aria} role={named ? "group" : undefined} className={well}>
      {isPreformatted ? (
        // A scrolling region must be reachable with the keyboard.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region
        <pre tabIndex={0} className={preformatted}>
          {children}
        </pre>
      ) : (
        children
      )}
    </div>
  );
}
