import { vars } from "@moonx/ui-tokens";
import { recipe } from "@vanilla-extract/recipes";
import { typography } from "../styles/helpers";

const tone = {
  primary: { color: vars.color.text.primary },
  secondary: { color: vars.color.text.secondary },
  tertiary: { color: vars.color.text.tertiary },
  negative: { color: vars.color.negative.fg },
};

/** Headings are the body face, heavier and tighter (design-spec 4.4). */
export const heading = recipe({
  base: {
    margin: 0,
    color: vars.color.text.primary,
    overflowWrap: "break-word",
  },
  variants: {
    style: {
      1: typography("heading1"),
      2: typography("heading2"),
      3: typography("heading3"),
      4: typography("heading4"),
      display: typography("display"),
      label: {
        ...typography("headingLabel"),
        color: vars.color.text.secondary,
      },
    },
  },
});

export const text = recipe({
  base: { margin: 0, overflowWrap: "break-word" },
  variants: {
    variant: {
      body: typography("body"),
      // Long answers keep the line breaks they were typed with.
      "body-long": { ...typography("bodyLong"), whiteSpace: "pre-wrap" },
      "body-sm": typography("bodySm"),
      caption: typography("caption"),
      label: typography("label"),
      number: {
        ...typography("number"),
        fontVariantNumeric: "tabular-nums",
      },
    },
    tone,
  },
  defaultVariants: { variant: "body", tone: "primary" },
});
