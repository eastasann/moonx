import { type Size, sizes, vars } from "@moonx/ui-tokens";
import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { reducedMotion } from "../styles/helpers";

const sized = Object.fromEntries(sizes.map((size) => [size, size])) as Record<
  Size,
  Size
>;

/** The mark and its label on one line (06 component.status-light, typography.label-sm). */
export const root = styleVariants(sized, (size) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.scale.component.statusLight.gap[size],
  minWidth: 0,
  fontFamily: vars.typography.labelSm.fontFamily,
  fontWeight: vars.typography.labelSm.fontWeight,
  letterSpacing: vars.typography.labelSm.letterSpacing,
  lineHeight: vars.typography.labelSm.lineHeight,
  fontSize: vars.scale.component.statusLight.fontSize[size],
}));

/**
 * The save states' label colours: Couldn't save in the red of errors (4.4). F/A/U and the
 * check states take their marks' label colours (internal/moon.css `labelColor`).
 */
export const label = styleVariants({
  quiet: { color: vars.color.text.secondary },
  failed: { color: vars.color.negative.fg },
});

const spin = keyframes({ to: { transform: "rotate(360deg)" } });

/** Movement stops when motion is reduced (06 motion.reduced); the label still says Saving…. */
export const spinning = style({
  display: "inline-flex",
  animation: `${spin} ${vars.motion.loop.spin} linear infinite`,
  "@media": { [reducedMotion]: { animation: "none" } },
});

export const icon = style({ display: "inline-flex" });
