import { vars } from "@moonx/ui-tokens";
import { createVar, fallbackVar } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { typography } from "../styles/helpers";

/**
 * The widest a Text runs (a length in ch), set by the block around it: a public page's
 * section (PublicSection). Unset elsewhere: a Text is as wide as its container.
 */
export const textMeasure = createVar();

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
      // The landing's title wraps into lines of even length (s01-landing.html .hero h1).
      display: {
        ...typography("display"),
        ...fluid("display"),
        textWrap: "balance",
      },
      // The landing's section titles, 22 characters wide at most (s01-landing.html h2).
      "display-2": {
        ...typography("display2"),
        ...fluid("display2"),
        maxWidth: `calc(${vars.layout.public.headingMeasure} * 1ch)`,
      },
      "heading-1-hub": typography("heading1Hub"),
      "heading-1-list": typography("heading1List"),
      "heading-1-steps": typography("heading1Steps"),
      "heading-1-settings": typography("heading1Settings"),
      "heading-1-toolbar": typography("heading1Toolbar"),
      "heading-question": typography("headingQuestion"),
      // A heading of level 2 or 3 with level 4's look: 9's group names (s09-settings.html).
      "heading-4": typography("heading4"),
      label: {
        ...typography("headingLabel"),
        color: vars.color.text.secondary,
      },
    },
  },
});

export const text = recipe({
  base: {
    margin: 0,
    overflowWrap: "break-word",
    maxWidth: fallbackVar(textMeasure, "none"),
  },
  variants: {
    variant: {
      body: typography("body"),
      // Long answers keep the line breaks they were typed with.
      "body-long": { ...typography("bodyLong"), whiteSpace: "pre-wrap" },
      "body-sm": typography("bodySm"),
      // A sentence in a row, the same size at every width (s05's Recent activity).
      "body-compact": typography("bodyCompact"),
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
      // A figure at the caption's size: "62 items", "· ₱77.00" (06 typography.number-sm).
      "number-sm": {
        ...typography("numberSm"),
        fontVariantNumeric: "tabular-nums",
      },
    },
    tone,
  },
  defaultVariants: { variant: "body", tone: "primary" },
});
