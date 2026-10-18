import { vars } from "@moonx/ui-tokens";
import { keyframes, style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { narrowQuery, reducedMotion, typography } from "../styles/helpers";

const riseIn = keyframes({
  from: { opacity: 0, transform: `translateY(${vars.space["200"]})` },
  to: { opacity: 1, transform: "translateY(0)" },
});
const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

/**
 * The toasts' landmark: fixed at the bottom centre, above dialogs (06 layout.z-index).
 * Newest at the bottom, nearest the edge. A closed toast goes at once: React Aria's toast
 * has no exit state to animate. On a phone with a TabBar it sits on the TabBar's
 * top edge instead of over the tabs (design-spec 4.5「下部（タブの上）」).
 */
export const region = recipe({
  base: {
    position: "fixed",
    insetInline: 0,
    bottom: 0,
    zIndex: vars.layout.zIndex.toast,
    display: "flex",
    flexDirection: "column-reverse",
    alignItems: "center",
    gap: vars.space["100"],
    padding: vars.layout.pageGutterMobile,
    paddingBlockEnd: `calc(${vars.layout.pageGutterMobile} + env(safe-area-inset-bottom))`,
    outline: "none",
    // The empty strip around the toasts lets presses through to the page.
    pointerEvents: "none",
  },
  variants: {
    aboveTabBar: {
      true: {
        "@media": {
          [narrowQuery]: {
            paddingBlockEnd: `calc(${vars.layout.pageGutterMobile} + ${vars.layout.tabBarHeight} + env(safe-area-inset-bottom))`,
          },
        },
      },
      false: {},
    },
  },
  defaultVariants: { aboveTabBar: false },
});

/** A raised card, like a popover: the ink on the overlay surface (4.4, no accent). */
export const toast = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["200"],
  minHeight: vars.scale.component.toast.minHeight,
  maxWidth: `min(${vars.scale.component.toast.maxWidth}, 100%)`,
  paddingBlock: vars.space["100"],
  paddingInlineStart: vars.space["300"],
  paddingInlineEnd: vars.space["100"],
  background: vars.color.surface.overlay,
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
  borderRadius: vars.radius.card,
  boxShadow: vars.shadow.overlay,
  color: vars.color.text.primary,
  pointerEvents: "auto",
  outline: "none",
  animation: `${riseIn} ${vars.motion.transition.enter.duration} ${vars.motion.transition.enter.timingFunction}`,
  selectors: {
    "&[data-focus-visible]": {
      outline: `${vars.borderWidth.focusRing} solid ${vars.color.border.focus}`,
      outlineOffset: vars.borderWidth.focusOffset,
    },
  },
  "@media": {
    [reducedMotion]: {
      animation: `${fadeIn} ${vars.motion.reduced.fade} linear`,
    },
  },
});

export const content = style({
  ...typography("body"),
  flex: "1 1 auto",
  minWidth: 0,
  overflowWrap: "break-word",
});

export const actions = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["50"],
  flexShrink: 0,
});
