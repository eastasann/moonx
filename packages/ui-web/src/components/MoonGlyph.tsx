import type { MoonGlyphSize, Size } from "@moonx/ui-tokens";
import { MoonMark, type MoonShape, type MoonState } from "../internal/MoonMark";
import * as styles from "../internal/moon.css";

export type { MoonState };

interface MoonGlyphBaseProps {
  /** @default "M" */
  size?: MoonGlyphSize;
  /** Rings the mark: the question on screen among 11's dots on a phone (design-spec 6.2). */
  isCurrent?: boolean;
}

interface StateProps {
  /**
   * The state's shape (design-spec 4.4「状態の形」): Fact and Done full, Assumption and
   * Partial half, Unknown and Not started new, Unclassified an amber diamond, Empty a
   * dotted ring.
   */
  state: MoonState;
  value?: never;
}

interface ValueProps {
  /** The share lit, 0 to 1: answered / asked for a section. 0 is the new moon's outline. */
  value: number;
  state?: never;
}

export type MoonGlyphProps = MoonGlyphBaseProps & (StateProps | ValueProps);

const shapeOf = (props: StateProps | ValueProps): MoonShape =>
  props.state !== undefined ? { state: props.state } : { value: props.value };

/**
 * A state's or a share's moon at a StatusLight step (06 status-light.dot-size): in
 * StatusLight and in the F/A/U buttons, beside text of that step. Not exported from the
 * package.
 */
export function MoonGlyphAt(props: (StateProps | ValueProps) & { size: Size }) {
  return <MoonMark shape={shapeOf(props)} className={styles.dot[props.size]} />;
}

/**
 * The mark of a state (design-spec 4.4・4.5): in CheckDots, the F/A/U breakdown, a row's
 * state, a section's progress and 11's question dots, at its own S and M (06
 * moon-glyph.size). Decorative: the label beside it names the state, since a shape alone
 * does not.
 */
export function MoonGlyph({ size = "M", isCurrent, ...props }: MoonGlyphProps) {
  const mark = (
    <MoonMark
      shape={shapeOf(props as StateProps | ValueProps)}
      className={styles.glyph[size]}
    />
  );
  return isCurrent ? <span className={styles.current}>{mark}</span> : mark;
}
