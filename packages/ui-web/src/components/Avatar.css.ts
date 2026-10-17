import { type AvatarSize, avatarSizes, vars } from "@moonx/ui-tokens";
import { styleVariants } from "@vanilla-extract/css";

const sized = Object.fromEntries(
  avatarSizes.map((size) => [size, size]),
) as Record<AvatarSize, AvatarSize>;

/** A rounded square of 06 component.avatar; a photo fills it. */
export const avatar = styleVariants(sized, (size) => ({
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  width: vars.scale.component.avatar.size[size],
  height: vars.scale.component.avatar.size[size],
  borderRadius: vars.scale.component.avatar.radius[size],
  objectFit: "cover",
  verticalAlign: "middle",
}));

/**
 * The initials in monospace on the sunken surface, without a frame or colour (design-spec
 * 4.4: no accent).
 */
export const initials = styleVariants(sized, (size) => ({
  overflow: "hidden",
  background: vars.color.surface.sunken,
  color: vars.color.text.secondary,
  fontFamily: vars.font.family.mono,
  fontWeight: vars.typography.heading4.fontWeight,
  fontSize: vars.scale.component.avatar.fontSize[size],
  userSelect: "none",
}));
