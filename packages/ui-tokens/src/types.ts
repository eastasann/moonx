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

/** The `size` every component takes (design-spec 4.5). */
export const sizes = ["S", "M", "L", "XL"] as const;
export type Size = (typeof sizes)[number];

/** Lucide icon sizes (`semantic.scale.*.component.icon.size`). */
export const iconSizes = ["XS", "S", "M", "L", "XL"] as const;
export type IconSize = (typeof iconSizes)[number];

/** Avatar sizes (design-spec 4.5). */
export const avatarSizes = ["S", "M"] as const;
export type AvatarSize = (typeof avatarSizes)[number];

/** Divider sizes (design-spec 4.5). */
export const dividerSizes = ["S", "M", "L"] as const;
export type DividerSize = (typeof dividerSizes)[number];

/**
 * The maximum widths of the small, medium and large Dialog (design-spec 3.8). Not the
 * Dialog's size prop, which also has fullscreen.
 */
export const dialogWidths = ["S", "M", "L"] as const;
export type DialogWidth = (typeof dialogWidths)[number];

/** InlineAlert variants and the status colours (design-spec 4.4・4.5). */
export const statusVariants = [
  "informative",
  "notice",
  "negative",
  "neutral",
] as const;
export type StatusVariant = (typeof statusVariants)[number];

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
