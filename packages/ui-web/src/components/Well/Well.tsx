import type { ReactNode } from "react";
import { well } from "./Well.css";

interface WellBaseProps {
  children: ReactNode;
}

/** A name is optional; when given, the well becomes a labelled group. */
export type WellProps = WellBaseProps &
  (
    | { "aria-label"?: undefined; "aria-labelledby"?: undefined }
    | { "aria-label": string; "aria-labelledby"?: undefined }
    | { "aria-label"?: undefined; "aria-labelledby": string }
  );

export function Well({ children, ...aria }: WellProps) {
  const named = aria["aria-label"] !== undefined || aria["aria-labelledby"] !== undefined;
  return (
    <div {...aria} role={named ? "group" : undefined} className={well}>
      {children}
    </div>
  );
}
