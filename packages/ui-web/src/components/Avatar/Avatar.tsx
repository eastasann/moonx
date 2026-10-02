import type { AvatarSize } from "@moonx/ui-tokens";
import { useState } from "react";
import { avatar, photo } from "./Avatar.css";

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
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = src != null && src !== "" && failed !== src;
  return (
    <span role="img" aria-label={name} className={avatar({ size })}>
      <span aria-hidden="true">{initialsOf(name)}</span>
      {showPhoto ? <img src={src} alt="" className={photo} onError={() => setFailed(src)} /> : null}
    </span>
  );
}
