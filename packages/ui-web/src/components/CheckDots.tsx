import { i18n, LOCALE } from "@moonx/i18n";
import type { MoonGlyphSize } from "@moonx/ui-tokens";
import * as styles from "./CheckDots.css";
import { MoonGlyph } from "./MoonGlyph";

/** A check's state as its moon shows it: Done full, Partial half, Not started new. */
export type CheckDotState = "not-started" | "partial" | "done";

const stateKey = {
  "not-started": "not_started",
  partial: "partial",
  done: "done",
} as const satisfies Record<CheckDotState, string>;

export interface CheckDotsProps {
  /**
   * The six checks in their order (design-spec 6.1), named as the screen shows them
   * (`formatCheckName` for the competitors' range).
   */
  checks: readonly { name: string; state: CheckDotState }[];
  /** @default "M" */
  size?: MoonGlyphSize;
}

/**
 * The checks of an idea as a row of moons (5 and 6, design-spec 4.5). One image to a
 * screen reader, read as every check's name and state.
 */
export function CheckDots({ checks, size = "M" }: CheckDotsProps) {
  const label = new Intl.ListFormat(LOCALE, {
    style: "long",
    type: "unit",
  }).format(
    checks.map(({ name, state }) =>
      i18n.t("components:checkDots.check", {
        name,
        state: i18n.t(`common:checkState.${stateKey[state]}`),
      }),
    ),
  );
  return (
    <span role="img" aria-label={label} className={styles.dots}>
      {checks.map(({ name, state }) => (
        <MoonGlyph key={name} state={state} size={size} />
      ))}
    </span>
  );
}
