import type { MetricGroupVariant, MetricTileTone } from "@moonx/ui-tokens";
import { TriangleAlert } from "lucide-react";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { BodyRoomContext } from "../internal/frame";
import { IconSlot } from "../internal/IconSlot";
import { lineIcon } from "../internal/lineIcon.css";
import * as styles from "./MetricTile.css";

/** The group's variant, and whether a band is drawn 2×2 where a phone would not. */
const GroupContext = createContext<{
  variant: MetricGroupVariant;
  isSquare: boolean;
} | null>(null);

export interface MetricGroupProps {
  /**
   * `band`: the key numbers across the top of a hub (13), between a line above and a
   * hairline below, a hairline between the tiles; 2×2 on a phone, and beside a desktop's
   * docked panel that leaves the body narrower than `layout.two-column-min-width`
   * (d1-moon.html, design-spec 4.1 A).
   * `compact`: the key numbers inside 19's Well, smaller and without lines, as many
   * columns as tiles; two on a phone (s19-decision.html). `column`: the totals of a
   * worksheet's results, one under another (s17-costs.html). `pair`: the key numbers of a
   * detail beside a list, 2×2 at every width, smaller, the units the numbers' size
   * (s06-ideas.html).
   * @default "band"
   */
  variant?: MetricGroupVariant;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** `MetricTile`s. */
  children: ReactNode;
}

/** The key numbers side by side (13・19, design-spec 4.5): lays out its `MetricTile`s. */
export function MetricGroup({
  variant = "band",
  children,
  ...props
}: MetricGroupProps) {
  const { hasTwoColumns } = useContext(BodyRoomContext);
  const isSquare = variant === "band" && !hasTwoColumns;
  const group = useMemo(() => ({ variant, isSquare }), [variant, isSquare]);
  const classes = [styles.group[variant]];
  if (isSquare) classes.push(styles.squareBand);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of related numbers, not of form controls, which fieldset is for.
    <div {...props} role="group" className={classes.join(" ")}>
      <GroupContext.Provider value={group}>{children}</GroupContext.Provider>
    </div>
  );
}

export interface MetricTileProps {
  /** The metric's name ("Startup cost", "Break-even"). */
  label: ReactNode;
  /** The formatted value ("₱169,500+", "6.9"), or why there is none ("Needs price"). */
  value: string;
  /** After the value, smaller and quieter in a band ("/ day", "months"). */
  unit?: string;
  /**
   * The value is not a number but "Empty" or a reason (design-spec 6.4「計算できない主要
   * 指標の表示」): it is set in the text size, quieter, and wraps between words.
   */
  isPlaceholder?: boolean;
  /** A line under the value: a reason, a warning, a link to the screen that fixes it. */
  supplement?: ReactNode;
  /**
   * `notice` marks the supplement as a warning (zero or negative contribution margin): amber
   * with a warning sign, not colour alone (design-spec 4.4).
   * @default "neutral"
   */
  supplementTone?: MetricTileTone;
}

/**
 * One key number (13・19, design-spec 4.5): its name, the number large in the monospaced
 * face with its unit, and an optional supplement, stacked. The unit moves to the next line
 * before the number would break; a number breaks only where it is wider than its tile
 * (design-spec 4.3・4.5). A `MetricGroup` lays the tiles out.
 */
export function MetricTile({
  label,
  value,
  unit,
  isPlaceholder = false,
  supplement,
  supplementTone = "neutral",
}: MetricTileProps) {
  const group = useContext(GroupContext);
  const variant = group?.variant ?? "none";
  return (
    <dl
      className={styles.tile({ variant, isSquare: group?.isSquare ?? false })}
    >
      <dt className={styles.label({ variant })}>{label}</dt>
      {isPlaceholder ? (
        <dd className={styles.placeholder}>{value}</dd>
      ) : (
        <dd className={styles.value({ variant })}>
          <span className={styles.number}>{value}</span>
          {unit !== undefined && (
            <>
              {" "}
              <span className={styles.unit({ variant })}>{unit}</span>
            </>
          )}
        </dd>
      )}
      {supplement != null && (
        <dd className={styles.supplement[supplementTone]}>
          {supplementTone === "notice" && (
            <span className={lineIcon}>
              <IconSlot size="XS">
                <TriangleAlert />
              </IconSlot>
            </span>
          )}
          <span>{supplement}</span>
        </dd>
      )}
    </dl>
  );
}
