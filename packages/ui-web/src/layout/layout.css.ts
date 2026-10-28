import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { desktopUp, tabletUp } from "../styles/helpers";

export const flex = style({ display: "flex", minWidth: 0 });

export const noShrink = style({ flexShrink: 0 });

export const grid = style({ display: "grid", minWidth: 0 });

/**
 * A centred column with the page gutters of each breakpoint (06 layout.page-gutter-*):
 * `content` for the body of a screen, `reading` for forms and long text. The widths
 * (06 layout.content-max, reading-column-max) are the content's: the gutters come on top.
 */
const widths = {
  content: vars.layout.contentMax,
  reading: vars.layout.readingColumnMax,
} as const;

export const container = recipe({
  base: {
    width: "100%",
    marginInline: "auto",
  },
  variants: {
    width: {
      content: { maxWidth: widths.content },
      reading: { maxWidth: widths.reading },
    },
    gutters: {
      true: {
        paddingInline: vars.layout.pageGutterMobile,
        "@media": {
          [tabletUp]: { paddingInline: vars.layout.pageGutterTablet },
          [desktopUp]: { paddingInline: vars.layout.pageGutterDesktop },
        },
      },
      false: {},
    },
  },
  compoundVariants: (["content", "reading"] as const).map((width) => ({
    variants: { width, gutters: true },
    style: {
      maxWidth: `calc(${widths[width]} + 2 * ${vars.layout.pageGutterMobile})`,
      "@media": {
        [tabletUp]: {
          maxWidth: `calc(${widths[width]} + 2 * ${vars.layout.pageGutterTablet})`,
        },
        [desktopUp]: {
          maxWidth: `calc(${widths[width]} + 2 * ${vars.layout.pageGutterDesktop})`,
        },
      },
    },
  })),
  defaultVariants: { width: "content", gutters: true },
});
