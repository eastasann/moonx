import { vars } from "@moonx/ui-tokens";
import { globalStyle, style, styleVariants } from "@vanilla-extract/css";
import { narrowQuery, typography } from "../styles/helpers";

const measures = vars.scale.component.steps;

/**
 * The steps in a row over a hairline, like tabs: no connecting lines, so a row that wraps
 * starts clean (s25-import.html .steps).
 */
export const steps = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: measures.gap,
  margin: 0,
  padding: 0,
  listStyle: "none",
  borderBottom: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  "@media": { [narrowQuery]: { columnGap: measures.narrowGap } },
});

/** A step: its mark and its name; the current one is underlined in ink. */
export const step = style({
  ...typography("stepLabel"),
  display: "inline-flex",
  alignItems: "center",
  gap: measures.markerGap,
  minWidth: 0,
  paddingBlockStart: measures.paddingTop,
  paddingBlockEnd: measures.paddingBottom,
  paddingInlineEnd: measures.paddingEnd,
  "@media": { [narrowQuery]: { paddingInlineEnd: 0 } },
});

export const stepState = styleVariants({
  done: { color: vars.color.text.secondary },
  current: {
    color: vars.color.text.primary,
    fontWeight: vars.typography.stepLabelCurrent.fontWeight,
    boxShadow: `inset 0 calc(-1 * ${measures.currentRuleWidth}) 0 ${vars.color.control.primary}`,
    "@media": { [narrowQuery]: { gap: measures.narrowMarkerGap } },
  },
  upcoming: { color: vars.color.text.tertiary },
});

/**
 * The step's number in a ring of its own colour; done, a check on the secondary fill
 * (s25-import.html .steps .n).
 */
const markerBase = {
  ...typography("count"),
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  width: measures.markerSize,
  height: measures.markerSize,
  boxSizing: "border-box",
  borderRadius: vars.radius.pill,
  border: `${measures.markerBorderWidth} solid currentColor`,
  fontVariantNumeric: "tabular-nums",
} as const;

export const marker = styleVariants({
  done: {
    ...markerBase,
    borderColor: vars.color.text.secondary,
    background: vars.color.text.secondary,
    color: vars.color.surface.canvas,
  },
  current: markerBase,
  upcoming: markerBase,
});

// A done step's check (s25-import.html: 12px).
globalStyle(`${marker.done} svg`, {
  width: measures.checkSize,
  height: measures.checkSize,
});

/**
 * On a phone only the current step keeps its name in sight; the others' names stay for
 * screen readers (s25-import.html at 390px).
 */
export const label = style({
  overflowWrap: "break-word",
  "@media": {
    [narrowQuery]: {
      selectors: {
        [`${step}:not([aria-current]) &`]: {
          position: "absolute",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          clipPath: "inset(50%)",
          whiteSpace: "nowrap",
        },
      },
    },
  },
});
