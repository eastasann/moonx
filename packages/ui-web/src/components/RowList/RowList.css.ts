import { style } from "@vanilla-extract/css";
import { vars } from "../../theme";

export const list = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
  selectors: {
    '&[data-ordered="true"]': { listStyle: "decimal", paddingInlineStart: vars.space["300"] },
  },
});

export const item = style({
  padding: vars.space["100"],
  paddingInline: 0,
  minWidth: 0,
  color: vars.color.text.primary,
  borderBlockStart: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
  selectors: {
    "&:first-child": { borderBlockStart: "none" },
    "&::marker": { color: vars.color.text.secondary },
  },
});
