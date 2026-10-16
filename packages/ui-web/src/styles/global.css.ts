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

globalStyle("button, input, textarea, select", {
  font: "inherit",
  color: "inherit",
});
