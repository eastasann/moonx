import { style } from "@vanilla-extract/css";
import { focusRing, visuallyHidden } from "../../styles.css";
import { breakpoints, vars } from "../../theme";

const belowTablet = `(max-width: ${breakpoints.tablet - 1}px)`;
const hairline = `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`;

export const root = style({
  display: "flex",
  minHeight: "100dvh",
  background: vars.color.surface.canvas,
  color: vars.color.text.primary,
});

export const column = style({ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 });

export const skipLink = style([
  visuallyHidden,
  {
    selectors: {
      "&:focus": {
        position: "fixed",
        insetBlockStart: vars.space["100"],
        insetInlineStart: vars.space["100"],
        zIndex: vars.layout["z-index"].toast,
        width: "auto",
        height: "auto",
        margin: 0,
        padding: vars.space["200"],
        clip: "auto",
        background: vars.color.surface.overlay,
        color: vars.color.text.link,
        borderRadius: vars.radius.control,
      },
      "&:focus-visible": focusRing,
    },
  },
]);

export const header = style({
  position: "sticky",
  insetBlockStart: 0,
  zIndex: vars.layout["z-index"].nav,
  display: "flex",
  alignItems: "center",
  gap: vars.space["200"],
  minHeight: vars.layout["header-height"],
  paddingInline: vars.layout["page-gutter-desktop"],
  background: vars.color.surface.raised,
  borderBlockEnd: hairline,
  "@media": {
    [belowTablet]: { paddingInline: vars.layout["page-gutter-mobile"] },
  },
});

export const lead = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["200"],
  flex: 1,
  minWidth: 0,
});

export const breadcrumbs = style({
  minWidth: 0,
  "@media": { [belowTablet]: { display: "none" } },
});

export const mobileTitle = style({
  display: "none",
  alignItems: "center",
  gap: vars.space["200"],
  minWidth: 0,
  fontFamily: vars.typography["heading-4"].fontFamily,
  fontSize: vars.typography["heading-4"].fontSize,
  fontWeight: vars.typography["heading-4"].fontWeight,
  lineHeight: vars.typography["heading-4"].lineHeight,
  "@media": { [belowTablet]: { display: "flex" } },
});

export const tools = style({ display: "flex", alignItems: "center", gap: vars.space["100"] });

export const main = style({
  flex: 1,
  minWidth: 0,
  selectors: { "&:focus": { outline: "none" } },
  "@media": {
    [belowTablet]: {
      paddingBlockEnd: `calc(${vars.layout["tab-bar-height"]} + env(safe-area-inset-bottom))`,
    },
  },
});
