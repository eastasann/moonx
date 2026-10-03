import type { AvatarSize } from "@moonx/ui-tokens";
import * as AvatarPrimitive from "@rn-primitives/avatar";
import { Text as NativeText } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { fontStyle } from "../../internal/typography";

export interface AvatarProps {
  /** Full name of the person; read by assistive technology and shortened to initials on screen. */
  name: string;
  size?: AvatarSize;
  /** The profile photo. The initials show while it loads and when it cannot be loaded. */
  src?: string | null;
}

/** First letters of the first two words, upper-cased; works per code point so kana and kanji survive. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

export function Avatar({ name, size = "M", src }: AvatarProps) {
  styles.useVariants({ size });
  const hasPhoto = src != null && src !== "";
  return (
    <AvatarPrimitive.Root alt={name} accessible role="img" aria-label={name} style={styles.avatar}>
      {/* Always drawn under the photo, like the Web part, so there is no blank frame while loading. */}
      <NativeText aria-hidden style={styles.initials}>
        {initialsOf(name)}
      </NativeText>
      {hasPhoto ? (
        <AvatarPrimitive.Image
          aria-hidden
          testID="avatar-photo"
          source={{ uri: src }}
          style={styles.photo}
        />
      ) : null}
    </AvatarPrimitive.Root>
  );
}

const styles = StyleSheet.create((theme) => ({
  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    alignSelf: "flex-start",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.control.secondary,
    variants: {
      size: {
        S: {
          width: theme.scale.component.avatar.size.S,
          height: theme.scale.component.avatar.size.S,
        },
        M: {
          width: theme.scale.component.avatar.size.M,
          height: theme.scale.component.avatar.size.M,
        },
      },
    },
  },
  initials: {
    ...fontStyle(theme, "label"),
    color: theme.color.control["on-secondary"],
    variants: {
      size: {
        S: { fontSize: theme.scale["font-size"]["50"] },
        M: { fontSize: theme.scale["font-size"]["100"] },
      },
    },
  },
  photo: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
}));
