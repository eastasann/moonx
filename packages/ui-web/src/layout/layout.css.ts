import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { desktopUp, tabletUp } from "../styles/helpers";

export const flex = style({ display: "flex", minWidth: 0 });

export const grid = style({ display: "grid", minWidth: 0 });

/**
 * A centred column with the page gutters of each breakpoint (06 layout.page-gutter-*):
 * `content` for the body of a screen, `reading` for forms and long text.
 */
export const container = recipe({
  base: {
    width: "100%",
    marginInline: "auto",
  },
  variants: {
    width: {
      content: { maxWidth: vars.layout.contentMax },
      reading: { maxWidth: vars.layout.readingColumnMax },
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
  defaultVariants: { width: "content", gutters: true },
});
