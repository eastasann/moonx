import { recipe } from "@vanilla-extract/recipes";
import { vars } from "../../theme";

export const buttonGroup = recipe({
  base: { display: "flex", flexWrap: "wrap", gap: vars.space["100"] },
  variants: {
    orientation: {
      horizontal: { flexDirection: "row", alignItems: "center" },
      vertical: { flexDirection: "column", alignItems: "stretch" },
    },
    align: {
      start: {},
      center: {},
      end: {},
    },
  },
  compoundVariants: [
    {
      variants: { orientation: "horizontal", align: "start" },
      style: { justifyContent: "flex-start" },
    },
    {
      variants: { orientation: "horizontal", align: "center" },
      style: { justifyContent: "center" },
    },
    {
      variants: { orientation: "horizontal", align: "end" },
      style: { justifyContent: "flex-end" },
    },
    { variants: { orientation: "vertical", align: "start" }, style: { alignItems: "flex-start" } },
    { variants: { orientation: "vertical", align: "center" }, style: { alignItems: "center" } },
    { variants: { orientation: "vertical", align: "end" }, style: { alignItems: "flex-end" } },
  ],
  defaultVariants: { orientation: "horizontal", align: "start" },
});
