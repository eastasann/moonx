import { vars } from "../../theme";

/** Minimum pointer target for the current scale: 24px with a mouse, 44px on touch (design-spec 4.3). */
export const targetMin = vars.scale.component["target-min"];

/** Grows a control's visual size to the minimum target without shrinking larger sizes. */
export const atLeastTarget = (size: string) => `max(${size}, ${targetMin})`;

/**
 * Extends the pointer area of a single-line flex item (a breadcrumb link) to the minimum target
 * height without changing its layout. Spread into the `selectors` of a `style()` whose element
 * is `position: relative`. It does not work for inline text that wraps across lines.
 */
export const hitAreaSelectors = {
  "&::after": {
    content: '""',
    position: "absolute",
    insetInline: 0,
    top: "50%",
    height: `max(100%, ${targetMin})`,
    transform: "translateY(-50%)",
  },
} as const;
