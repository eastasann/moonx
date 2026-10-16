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

/**
 * A state's or a share's moon at any StatusLight step. Not exported from the package:
 * StatusLight's L and XL marks are larger than a MoonGlyph of its own (S and M).
 */
export function MoonGlyphAt(
  props: (StateProps | ValueProps) & { size: Size; isCurrent?: boolean },
) {
  const shape: MoonShape =
    props.state !== undefined ? { state: props.state } : { value: props.value };
  const mark = <MoonMark shape={shape} className={styles.dot[props.size]} />;
  return props.isCurrent ? (
    <span className={styles.current}>{mark}</span>
  ) : (
    mark
  );
}

/**
 * The mark of a state (design-spec 4.4・4.5): in CheckDots, StatusLight, the F/A/U
 * breakdown, a section's progress and 11's question dots. Decorative: the label beside it
 * names the state, since a shape alone does not.
 */
export function MoonGlyph({ size = "M", ...props }: MoonGlyphProps) {
  return <MoonGlyphAt size={size} {...props} />;
}
