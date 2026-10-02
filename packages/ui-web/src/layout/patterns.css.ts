import { globalStyle, style } from "@vanilla-extract/css";
import { breakpoints, vars } from "../theme";

const desktop = `(min-width: ${breakpoints.desktop}px)`;
const tablet = `(min-width: ${breakpoints.tablet}px)`;

const page = {
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular["section-gap"],
  width: "100%",
  maxWidth: vars.layout["content-max"],
  marginInline: "auto",
  paddingInline: vars.layout["page-gutter-mobile"],
  paddingBlock: vars.space["400"],
  "@media": {
    [tablet]: { paddingInline: vars.layout["page-gutter-tablet"] },
    [desktop]: { paddingInline: vars.layout["page-gutter-desktop"] },
  },
} as const;

export const pageFrame = style(page);

export const readingFrame = style({
  ...page,
  maxWidth: vars.layout["reading-column-max"],
});

const aboveTabBar = `calc(${vars.layout["tab-bar-height"]} + env(safe-area-inset-bottom))`;

const pinned = {
  position: "sticky",
  bottom: aboveTabBar,
  zIndex: vars.layout["z-index"]["bottom-action"],
  background: vars.color.surface.raised,
  borderBlockStart: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
  selectors: { '&[data-tab-bar="false"]': { bottom: 0 } },
} as const;

/**
 * Mobile main action pinned above the fixed `TabBar` (or at the viewport bottom when the page has
 * none). The `TabBar` hides from tablet up, where the action returns to the flow.
 */
export const bottomAction = style({
  ...pinned,
  display: "flex",
  justifyContent: "flex-end",
  gap: vars.space["200"],
  minHeight: vars.layout["bottom-action-height"],
  alignItems: "center",
  paddingInline: vars.layout["page-gutter-mobile"],
  paddingBlock: vars.space["200"],
  "@media": {
    [tablet]: {
      position: "static",
      background: "transparent",
      border: "none",
      padding: 0,
      minHeight: 0,
    },
  },
});

export const header = style({ display: "flex", flexDirection: "column", gap: vars.space["200"] });

export const twoColumns = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: vars.density.regular["block-gap"],
  alignItems: "start",
  "@media": { [desktop]: { gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" } },
});

export const column = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular["block-gap"],
  minWidth: 0,
});

/** Below desktop the two columns vanish from the box tree, so the DOM order is the stacking order. */
const asChildren = style({ display: "contents", "@media": { [desktop]: { display: "flex" } } });

export const hubLeft = style([column, asChildren]);
export const hubRight = style([column, asChildren]);
export const hubSummary = column;
export const hubNext = column;
export const hubStatus = column;
export const hubEntries = column;
export const hubHistory = column;

export const listDetail = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: vars.density.regular.gap,
  alignItems: "start",
  "@media": {
    [desktop]: {
      gridTemplateColumns: `minmax(0, ${vars.layout["list-pane-width"]}) minmax(0, 1fr)`,
      height: "100%",
    },
  },
});

export const listPane = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.gap,
  minWidth: 0,
  selectors: { '&[data-hidden="true"]': { display: "none" } },
  "@media": { [desktop]: { selectors: { '&[data-hidden="true"]': { display: "flex" } } } },
});

export const detailPane = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.gap,
  minWidth: 0,
  selectors: { '&[data-hidden="true"]': { display: "none" } },
  "@media": { [desktop]: { selectors: { '&[data-hidden="true"]': { display: "flex" } } } },
});

export const cardGrid = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: vars.density.regular.gap,
  "@media": {
    [tablet]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    [desktop]: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
  },
});

export const worksheet = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: vars.density.regular["block-gap"],
  alignItems: "start",
  "@media": {
    [desktop]: {
      gridTemplateColumns: `minmax(0, 1fr) minmax(0, ${vars.layout["side-panel-width"]})`,
    },
  },
});

export const worksheetResult = style({
  position: "sticky",
  top: vars.space["400"],
  minWidth: 0,
});

/** The trigger bar of the result tray. It is rendered only below desktop. */
export const resultBar = style({
  ...pinned,
  padding: vars.space["200"],
  "@media": { [tablet]: { bottom: 0 } },
});

export const resultTrigger = style({
  display: "block",
  width: "100%",
  minHeight: vars.layout["bottom-action-height"],
  textAlign: "start",
  background: "transparent",
  border: "none",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
});

export const stepsBar = style({ display: "flex", justifyContent: "center" });

export const diffColumns = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: vars.density.regular["block-gap"],
  "@media": { [desktop]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } },
});

export const presentation = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: vars.density.regular["block-gap"],
  "@media": {
    [desktop]: {
      gridTemplateColumns: `${vars.layout["thumbnail-column-width"]} minmax(0, 1fr)`,
      alignItems: "start",
    },
  },
});

export const thumbnails = style({
  display: "none",
  "@media": {
    [desktop]: { display: "flex", flexDirection: "column", gap: vars.space["200"] },
  },
});

export const slides = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular["block-gap"],
  minWidth: 0,
});

/**
 * One question per screen below tablet. Cards are hidden only while some card is focused, so a
 * form with no focused card still shows every question.
 */
export const questionFrame = style({});

globalStyle(
  `${questionFrame}:has([data-question-card][data-focused="true"]) [data-question-card][data-focused="false"]`,
  { "@media": { [`(max-width: ${breakpoints.tablet - 1}px)`]: { display: "none" } } },
);
