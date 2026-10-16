// The value types the component props share (ADR-025). Written by hand, not generated:
// each list mirrors a group of docs/06_design-tokens.json, and types.test.ts fails when
// the two drift apart.

/**
 * `<html data-theme>`: fixes the colour scheme (4 アカウント設定 Light / Dark). Without
 * the attribute the page follows the OS (System). See ADR-018.
 */
export const colorSchemes = ["light", "dark"] as const;
export type ColorScheme = (typeof colorSchemes)[number];

/**
 * `<html data-scale>`: fixes the scale. Without the attribute, touch screens
 * (`pointer: coarse`) get large and the rest medium (ADR-018).
 */
export const scales = ["medium", "large"] as const;
export type Scale = (typeof scales)[number];

/** Table, list and form density (design-spec 4.4「密度とスケールの対応」). */
export const densities = ["compact", "regular", "spacious"] as const;
export type Density = (typeof densities)[number];

/** The densities a screen picks: compact is held in reserve (06 semantic.density). */
export type ScreenDensity = Exclude<Density, "compact">;

/**
 * The `size` of the components that take one, unless they have their own steps below
 * (design-spec 4.5). Components Spectrum 2 gives no size, such as Heading or Link, take
 * none.
 */
export const sizes = ["S", "M", "L", "XL"] as const;
export type Size = (typeof sizes)[number];

/**
 * The steps of the components whose sizes start at XS, as Spectrum 2's do: ToggleButtonGroup
 * here (design-spec 4.5 lists the rest). Its values are 06 component.action-button.
 */
export const sizesWithXS = ["XS", "S", "M", "L", "XL"] as const;
export type SizeWithXS = (typeof sizesWithXS)[number];

/** TagGroup's sizes: Spectrum 2's steps (design-spec 4.5, 06 component.tag). */
export const tagSizes = ["S", "M", "L"] as const;
export type TagSize = (typeof tagSizes)[number];

/** Lucide icon sizes (`semantic.scale.*.component.icon.size`). */
export const iconSizes = ["XS", "S", "M", "L", "XL"] as const;
export type IconSize = (typeof iconSizes)[number];

/** Avatar sizes (design-spec 4.5). */
export const avatarSizes = ["S", "M"] as const;
export type AvatarSize = (typeof avatarSizes)[number];

/** ProgressCircle sizes (design-spec 4.5, 06 component.progress-circle). */
export const progressCircleSizes = ["S", "M", "L"] as const;
export type ProgressCircleSize = (typeof progressCircleSizes)[number];

/** Divider sizes (design-spec 4.5). */
export const dividerSizes = ["S", "M", "L"] as const;
export type DividerSize = (typeof dividerSizes)[number];

/**
 * The maximum widths of the small, medium and large Dialog (design-spec 3.8). Not the
 * Dialog's size prop, which also has fullscreen.
 */
export const dialogWidths = ["S", "M", "L"] as const;
export type DialogWidth = (typeof dialogWidths)[number];

/**
 * Dialog's `size` (design-spec 4.5): the three widths, and `fullscreen`, which fills the
 * window at every width. Which modal takes which is design-spec 3.8.
 */
export const dialogSizes = [...dialogWidths, "fullscreen"] as const;
export type DialogSize = (typeof dialogSizes)[number];

/** Popover widths (design-spec 4.5, 06 component.popover.width). Unsized, it fits its content. */
export const popoverSizes = ["S", "M", "L"] as const;
export type PopoverSize = (typeof popoverSizes)[number];

/** ContextualHelp sizes: its button's, from 06 component.action-button (design-spec 4.5). */
export const contextualHelpSizes = ["XS", "S"] as const;
export type ContextualHelpSize = (typeof contextualHelpSizes)[number];

/** Breadcrumbs sizes (design-spec 4.5, 06 component.breadcrumbs). */
export const breadcrumbsSizes = ["M", "L"] as const;
export type BreadcrumbsSize = (typeof breadcrumbsSizes)[number];

/** IllustratedMessage sizes (design-spec 4.5, 06 component.illustrated-message). */
export const illustratedMessageSizes = ["S", "M", "L"] as const;
export type IllustratedMessageSize = (typeof illustratedMessageSizes)[number];

/** InlineAlert variants and the status colours (design-spec 4.4・4.5). */
export const statusVariants = [
  "informative",
  "notice",
  "negative",
  "neutral",
] as const;
export type StatusVariant = (typeof statusVariants)[number];

/**
 * Badge's `variant`: the text in ink, or the amber text of "Overdue" and "overdue 3d"
 * (design-spec 4.5). Notice only takes the outline frame.
 */
export const badgeVariants = ["neutral", "notice"] as const;
export type BadgeVariant = (typeof badgeVariants)[number];

/**
 * Badge's `fillStyle`: Spectrum 2's `outline` and `bold` and moonx's `dashed`. `outline`
 * is the uncoloured frame (Proceed / Hold / Drop, stages), `dashed` the frame of
 * Undecided, `bold` the ink fill of an unread count (design-spec 4.5).
 */
export const badgeFillStyles = ["outline", "dashed", "bold"] as const;
export type BadgeFillStyle = (typeof badgeFillStyles)[number];

/**
 * StatusLight's `variant` (design-spec 4.5): the F/A/U states and the check states drawn
 * as MoonGlyph's moons (4.4「状態の形」), and the save states, which show an icon instead
 * (6.0.2: Saving…, Saved ✓, Couldn't save with a warning).
 */
export const statusLightVariants = [
  "fact",
  "assumption",
  "unknown",
  "unclassified",
  "empty",
  "not-started",
  "partial",
  "done",
  "saving",
  "saved",
  "save-failed",
] as const;
export type StatusLightVariant = (typeof statusLightVariants)[number];

/** The F/A/U states that have colours (design-spec 6.0.3). */
export const fauStates = [
  "fact",
  "assumption",
  "unknown",
  "unclassified",
  "empty",
] as const;
export type FauState = (typeof fauStates)[number];

/** Spacing by name, as layout components take it: `gap="space-300"` (ADR-025). */
export const spaces = [
  "space-25",
  "space-50",
  "space-75",
  "space-85",
  "space-100",
  "space-200",
  "space-300",
  "space-350",
  "space-400",
  "space-500",
  "space-600",
  "space-700",
  "space-800",
  "space-900",
  "space-1000",
] as const;
export type Space = (typeof spaces)[number];

/**
 * Button's `variant` (design-spec 4.5): primary is the one main action of a screen,
 * negative only confirms a deletion.
 */
export const buttonVariants = ["primary", "secondary", "negative"] as const;
export type ButtonVariant = (typeof buttonVariants)[number];

/** Link's `variant`: primary on its own line, secondary inside running text. */
export const linkVariants = ["primary", "secondary"] as const;
export type LinkVariant = (typeof linkVariants)[number];

/** Heading's `variant`, when its look differs from its level's (design-spec 4.5). */
export const headingVariants = ["display", "label"] as const;
export type HeadingVariant = (typeof headingVariants)[number];

/** Text's `variant` (design-spec 4.5). */
export const textVariants = [
  "body",
  "body-long",
  "body-sm",
  "caption",
  "label",
  "number",
] as const;
export type TextVariant = (typeof textVariants)[number];

/** Text's `tone` (design-spec 4.5). */
export const textTones = [
  "primary",
  "secondary",
  "tertiary",
  "negative",
] as const;
export type TextTone = (typeof textTones)[number];
