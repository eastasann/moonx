import "@moonx/ui-tokens/theme.css";
import { vars } from "@moonx/ui-tokens";
import { globalStyle } from "@vanilla-extract/css";
import { typography } from "./helpers";

// The page base every screen sits on. Importing the package loads it with the theme, so
// no screen can render components without their tokens.

globalStyle("*, *::before, *::after", { boxSizing: "border-box" });

globalStyle("html", {
  // iOS enlarges text on rotation unless told not to; the scale tokens size the text.
  WebkitTextSizeAdjust: "100%",
  textSizeAdjust: "100%",
});

globalStyle("body", {
  margin: 0,
  background: vars.color.surface.canvas,
  color: vars.color.text.primary,
  ...typography("body"),
});

// The bold of running text is 06's semibold: the browser's own "bolder" would ask for a
// weight the page does not load (06 primitive.font.weight).
globalStyle("strong, b", {
  fontWeight: vars.typography.heading4.fontWeight,
});

globalStyle("button, input, textarea, select", {
  font: "inherit",
  color: "inherit",
});
