import type { MoonState } from "../internal/MoonMark";
import { MoonMark } from "../internal/MoonMark";
import * as styles from "./Landing.css";

export interface CostPreviewProps {
  /** What the picture shows, read in its place ("Example startup costs with …"). */
  "aria-label": string;
  /** The rows: the F/A/U moon, the name, the amount or "Unknown" / "Empty" (`isMuted`). */
  rows: { state: MoonState; name: string; amount: string; isMuted?: boolean }[];
  /** The totals in the band under the rows ("Startup ₱145,000+"). */
  totals: { label: string; value: string }[];
}

/**
 * The landing's example of costs (1, design-spec 6.16, s01-landing.html .sheet): a few
 * rows of a worksheet and the totals on the sunken band under them, in a card. A picture,
 * read as one by its name.
 */
export function CostPreview({ rows, totals, ...props }: CostPreviewProps) {
  return (
    <div role="img" {...props} className={styles.sheet}>
      {rows.map((row) => (
        <div key={row.name} className={styles.sheetRow}>
          <MoonMark shape={{ state: row.state }} className={styles.sheetMoon} />
          <span>{row.name}</span>
          <span
            className={
              row.isMuted
                ? `${styles.sheetAmount} ${styles.sheetMuted}`
                : styles.sheetAmount
            }
          >
            {row.amount}
          </span>
        </div>
      ))}
      <div className={styles.sheetTotals}>
        {totals.map((total) => (
          <div key={total.label} className={styles.sheetTotal}>
            <div className={styles.previewLabel}>{total.label}</div>
            <div className={styles.sheetValue}>{total.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
