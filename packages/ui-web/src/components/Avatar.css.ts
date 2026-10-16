import { type AvatarSize, avatarSizes, vars } from "@moonx/ui-tokens";
import { styleVariants } from "@vanilla-extract/css";

const sized = Object.fromEntries(
  avatarSizes.map((size) => [size, size]),
) as Record<AvatarSize, AvatarSize>;

/** A circle of 06 component.avatar.size; a photo fills it. */
export const avatar = styleVariants(sized, (size) => ({
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  width: vars.scale.component.avatar.size[size],
  height: vars.scale.component.avatar.size[size],
  borderRadius: vars.radius.pill,
  objectFit: "cover",
  verticalAlign: "middle",
}));

/**
 * The initials in the sunken surface, without colour (design-spec 4.4: no accent): two
 * letters fit S at font-size-50 and M at font-size-100.
 */
export const initials = styleVariants(
  { S: "50", M: "100" } as const satisfies Record<AvatarSize, string>,
  (step) => ({
    overflow: "hidden",
    background: vars.color.surface.sunken,
    border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    color: vars.color.text.secondary,
    fontFamily: vars.font.family.body,
    fontWeight: vars.typography.labelSm.fontWeight,
    fontSize: vars.scale.fontSize[step],
    userSelect: "none",
  }),
);
