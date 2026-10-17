import { vars } from "@moonx/ui-tokens";
import { recipe } from "@vanilla-extract/recipes";
import { typography } from "../styles/helpers";

const tone = {
  primary: { color: vars.color.text.primary },
  secondary: { color: vars.color.text.secondary },
  tertiary: { color: vars.color.text.tertiary },
  // The amber of attention: "Not classified yet" (6.2), "Unknown 5" (19).
  notice: { color: vars.color.notice.fg },
  negative: { color: vars.color.negative.fg },
};

/**
 * The landing's titles grow with the window between their smallest and largest sizes,
 * their tracking in em so it follows (06 semantic.fluid-type, s01-landing.html).
 */
const fluid = (name: keyof typeof vars.fluidType) => {
  const type = vars.fluidType[name];
  return {
    fontSize: `clamp(${type.min}, calc(${type.viewport} * 1vw), ${type.max})`,
    letterSpacing: `calc(${type.tracking} * 1em)`,
  };
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
      display: { ...typography("display"), ...fluid("display") },
      "display-2": { ...typography("display2"), ...fluid("display2") },
      "heading-1-hub": typography("heading1Hub"),
      "heading-1-list": typography("heading1List"),
      "heading-1-steps": typography("heading1Steps"),
      "heading-1-settings": typography("heading1Settings"),
      "heading-1-toolbar": typography("heading1Toolbar"),
      "heading-question": typography("headingQuestion"),
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
      // The landing's lead, 40 characters wide at most (06 semantic.typography.lead).
      lead: {
        ...typography("lead"),
        maxWidth: `calc(${vars.layout.leadMeasure} * 1ch)`,
      },
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
