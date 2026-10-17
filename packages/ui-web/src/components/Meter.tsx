import { formatUnits } from "@moonx/i18n";
import type { FauState, Size } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import * as styles from "./Meter.css";

export interface MeterSegment {
  /** The F/A/U state the segment counts: it decides the band's shade (06 color.fau). */
  state: FauState;
  /** The legend's name for it ("Fact", "Assumption"). */
  label: ReactNode;
  count: number;
  /** More after the count: the confidences "(L3 M4 H2)", Facts without evidence. */
  detail?: ReactNode;
}

export interface MeterProps {
  /** What the band breaks down ("Fact / Assumption / Unknown"). */
  label: ReactNode;
  /** The band's segments, left to right; the legend lists them in the same order. */
  segments: readonly MeterSegment[];
  /** @default "M" */
  size?: Size;
}

/**
 * The F/A/U breakdown (13, design-spec 4.5): Spectrum's Meter stacked, one segment per
 * state, as wide as its share. The legend repeats each segment's swatch with its name and
 * count, and carries the numbers for screen readers; the band itself is decorative.
 */
export function Meter({ label, segments, size = "M" }: MeterProps) {
  const shown = segments.filter((segment) => segment.count > 0);
  return (
    <figure className={`${styles.meter} ${styles.size[size]}`}>
      <figcaption className={styles.label}>{label}</figcaption>
      <div aria-hidden="true" className={styles.band[size]}>
        {shown.map((segment) => (
          <span
            key={segment.state}
            className={styles.shade[segment.state]}
            // A segment's width is its share of the count, not a value a token holds.
            style={{ flexGrow: segment.count }}
          />
        ))}
      </div>
      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li
            key={segment.state}
            className={
              styles.entry[
                segment.state === "unclassified" ? "unclassified" : "other"
              ]
            }
          >
            <span
              aria-hidden="true"
              className={`${styles.swatch} ${styles.shade[segment.state]} ${
                segment.state === "empty" ? styles.swatchEdge : ""
              }`}
            />
            <span>{segment.label}</span>
            <span className={styles.count}>{formatUnits(segment.count)}</span>
            {segment.detail != null && (
              <span className={styles.detail}>{segment.detail}</span>
            )}
          </li>
        ))}
      </ul>
    </figure>
  );
}
