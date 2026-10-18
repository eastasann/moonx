import * as styles from "./moon.css";

/** The states a moon mark draws (design-spec 4.4「状態の形」). */
export type MoonState =
  | "fact"
  | "assumption"
  | "unknown"
  | "unclassified"
  | "empty"
  | "not-started"
  | "partial"
  | "done";

/** The check states share the F/A/U moons: Done is full, Partial half, Not started new. */
const moon = {
  fact: { colour: "fact", lit: 1 },
  done: { colour: "fact", lit: 1 },
  assumption: { colour: "assumption", lit: 0.5 },
  partial: { colour: "assumption", lit: 0.5 },
  unknown: { colour: "unknown", lit: 0 },
  "not-started": { colour: "unknown", lit: 0 },
} as const;

// The glyph is drawn in a 20-unit box, the moon a circle of radius 9 at its centre.
const C = 10;
const R = 9;
/** Empty's ring: the mockup's 14px ring in a 16px box (moon-base.css .dot-empty). */
const EMPTY_R = 8;

/**
 * The lit part of a moon `lit` full (0 to 1), waxing from the right: the right half of
 * the disc, closed by the terminator, an ellipse that bulges right for a crescent and
 * left for a gibbous moon.
 */
function litPath(lit: number): string {
  const rx = Math.abs(1 - 2 * lit) * R;
  const sweep = lit < 0.5 ? 0 : 1;
  return `M ${C} ${C - R} A ${R} ${R} 0 0 1 ${C} ${C + R} A ${rx} ${R} 0 0 ${sweep} ${C} ${C - R} Z`;
}

/**
 * What a mark shows: a state, or a share lit (0 to 1) such as a section's progress. A
 * share outside 0–1 is held to it; NaN (none of none answered) is the new moon.
 */
export type MoonShape = { state: MoonState } | { value: number };

/**
 * The moon of a state or a share, sized by the caller's class (width and height from a
 * token). Decorative: the label beside it carries the state (design-spec 4.4: never shape
 * or colour alone). The one drawing of the moons: MoonGlyph and StatusLight both use it.
 */
export function MoonMark({
  shape,
  className,
}: {
  shape: MoonShape;
  className: string;
}) {
  const state = "state" in shape ? shape.state : null;
  if (state === "unclassified") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className={`${styles.mark} ${styles.color.unclassified} ${className}`}
      >
        {/* moon-base.css .dot-attn: a square with rounded corners turned 45°, its
            10px and 3px corners scaled from the mockup's 16px box to this 20-unit one. */}
        <rect
          x={3.75}
          y={3.75}
          width={12.5}
          height={12.5}
          rx={3.75}
          transform="rotate(45 10 10)"
          className={styles.lit}
        />
      </svg>
    );
  }
  if (state === "empty") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className={`${styles.mark} ${styles.color.empty} ${className}`}
      >
        {/* moon-base.css .dot-empty: a ring of short dashes inside the box's edge;
            pathLength makes them an even twelve at any size. */}
        <circle
          cx={C}
          cy={C}
          r={EMPTY_R}
          pathLength={24}
          strokeDasharray="1 1"
          className={styles.line}
        />
      </svg>
    );
  }
  // A share is drawn in the ink of a full moon at every value: it counts how much is
  // there, it is not a state of its own.
  const { colour, lit } =
    state !== null
      ? moon[state]
      : {
          colour: "fact" as const,
          lit:
            "value" in shape && !Number.isNaN(shape.value)
              ? Math.min(Math.max(shape.value, 0), 1)
              : 0,
        };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={`${styles.mark} ${styles.color[colour]} ${className}`}
    >
      <circle cx={C} cy={C} r={R} className={styles.line} />
      {lit >= 1 ? (
        <circle cx={C} cy={C} r={R} className={styles.lit} />
      ) : lit > 0 ? (
        <path d={litPath(lit)} className={styles.lit} />
      ) : null}
    </svg>
  );
}
