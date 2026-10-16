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
 * The moon of a state, sized by the caller's class (width and height from a token).
 * Decorative: the label beside it carries the state (design-spec 4.4: never shape or
 * colour alone).
 */
export function MoonMark({
  state,
  className,
}: {
  state: MoonState;
  className: string;
}) {
  if (state === "unclassified") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className={`${styles.mark} ${styles.color.unclassified} ${className}`}
      >
        <path d="M 10 1 L 19 10 L 10 19 L 1 10 Z" className={styles.lit} />
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
        {/* pathLength makes the dots an even ring of eight at any size. */}
        <circle
          cx={C}
          cy={C}
          r={R}
          pathLength={16}
          strokeDasharray="1 1"
          className={styles.line}
        />
      </svg>
    );
  }
  const { colour, lit } = moon[state];
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
