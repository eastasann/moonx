import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.color.surface.canvas },
  content: {
    gap: theme.density.regular["section-gap"],
    paddingHorizontal: theme.layout["page-gutter-mobile"],
    paddingVertical: theme.space["400"],
  },
  header: {
    gap: theme.space["200"],
    padding: theme.space["300"],
    borderRadius: theme.radius.card,
    borderWidth: theme["border-width"].hairline,
    borderColor: theme.color.border.hairline,
    backgroundColor: theme.color.surface.raised,
  },
  controlRow: { gap: theme.space["100"] },
  section: { gap: theme.density.regular["block-gap"] },
  component: {
    gap: theme.space["200"],
    padding: theme.space["300"],
    borderRadius: theme.radius.card,
    borderWidth: theme["border-width"].hairline,
    borderColor: theme.color.border.hairline,
    backgroundColor: theme.color.surface.raised,
  },
  group: { gap: theme.space["100"] },
  cases: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: theme.space["300"],
  },
  casesColumn: { gap: theme.space["300"] },
  caseBox: { gap: theme.space["100"], alignItems: "flex-start", maxWidth: "100%" },
  caseBoxFull: { gap: theme.space["100"], alignSelf: "stretch" },
  caseBody: { alignSelf: "stretch" },
  caseBodyInline: { alignSelf: "flex-start", maxWidth: "100%" },
  /** The patterns and the app frame fill the screen, so they need a box of a screen's height. */
  frame: (windowHeight: number) => ({
    height: windowHeight * theme.layout["sheet-max-height-ratio"],
    overflow: "hidden",
    borderRadius: theme.radius.card,
    borderWidth: theme["border-width"].hairline,
    borderColor: theme.color.border.strong,
    backgroundColor: theme.color.surface.canvas,
  }),
  slideBox: { alignSelf: "stretch" },
  verticalBox: { height: theme.space["800"], alignItems: "center" },
}));
