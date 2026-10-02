/**
 * Value types shared by packages/ui-web and packages/ui-native (ADR-025). Hand-written; the
 * lists mirror docs/design-spec.md 4.5. test/types.test.ts checks the ones that have a token
 * counterpart (sizes, density, space, status colors) against docs/06_design-tokens.json.
 */

export const COMPONENT_SIZES = ["S", "M", "L", "XL"] as const;
/** Button, ActionButton, TextField and the other sized components (Spectrum S / M / L / XL). */
export type ComponentSize = (typeof COMPONENT_SIZES)[number];

export const BUTTON_VARIANTS = ["accent", "primary", "secondary", "negative"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const INLINE_ALERT_VARIANTS = ["informative", "notice", "negative", "neutral"] as const;
export type InlineAlertVariant = (typeof INLINE_ALERT_VARIANTS)[number];

/** Status color families of semantic.color: StatusLight, Badge and Meter take one of these. */
export const STATUS_VARIANTS = [
  "informative",
  "positive",
  "notice",
  "negative",
  "neutral",
  "seafoam",
  "indigo",
  "purple",
  "pink",
  "brown",
] as const;
export type StatusVariant = (typeof STATUS_VARIANTS)[number];

export const DENSITIES = ["compact", "regular", "spacious"] as const;
/** Table, list and form density (design-spec 4.4). */
export type Density = (typeof DENSITIES)[number];

export const DIVIDER_SIZES = ["S", "M", "L"] as const;
export type DividerSize = (typeof DIVIDER_SIZES)[number];

export const AVATAR_SIZES = ["S", "M"] as const;
export type AvatarSize = (typeof AVATAR_SIZES)[number];

export const DIALOG_SIZES = ["small", "medium", "large", "fullscreen"] as const;
export type DialogSize = (typeof DIALOG_SIZES)[number];

export const SPACE_STEPS = [
  "25",
  "50",
  "75",
  "85",
  "100",
  "200",
  "300",
  "350",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "1000",
] as const;
export type SpaceStep = (typeof SPACE_STEPS)[number];
/** Spacing prop value for layout components, e.g. `gap="space-300"`. */
export type SpaceName = `space-${SpaceStep}`;

/** Maps a `SpaceName` to its key in the generated `space` tokens. */
export function spaceStep(name: SpaceName): SpaceStep {
  return name.slice("space-".length) as SpaceStep;
}
