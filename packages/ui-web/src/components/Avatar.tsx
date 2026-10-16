import { LOCALE } from "@moonx/i18n";
import type { AvatarSize } from "@moonx/ui-tokens";
import { useState } from "react";
import * as styles from "./Avatar.css";

const segmenter = new Intl.Segmenter(LOCALE, { granularity: "grapheme" });

const firstGrapheme = (word: string) =>
  segmenter.segment(word)[Symbol.iterator]().next().value?.segment ?? "";

/**
 * Up to two initials: the first letters of the first and the last word ("Ana Reyes" → AR,
 * "Kenji" → K). A letter is a whole grapheme, so an accented or CJK name keeps its first
 * character intact.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = words[0];
  if (first === undefined) return "";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return (
    firstGrapheme(first) + (last === undefined ? "" : firstGrapheme(last))
  ).toLocaleUpperCase(LOCALE);
}

export interface AvatarProps {
  /** The person's display name: the initials come from it. */
  name: string;
  /** The profile photo's URL. Without one, or when it does not load, the initials show. */
  src?: string | null;
  /**
   * The text alternative. Leave it empty (the default) when the name is shown beside the
   * avatar, as it usually is (proposer, recorder, a comment's author).
   * @default ""
   */
  alt?: string;
  /** @default "S" */
  size?: AvatarSize;
}

/** A person's photo, or their initials when there is none (design-spec 4.5). */
export function Avatar({ name, src, alt = "", size = "S" }: AvatarProps) {
  // The URL that failed: a new photo is tried again.
  const [failed, setFailed] = useState<string | null>(null);
  if (src != null && src !== failed) {
    return (
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(src)}
        className={styles.avatar[size]}
      />
    );
  }
  const className = `${styles.avatar[size]} ${styles.initials[size]}`;
  return alt === "" ? (
    <span aria-hidden="true" className={className}>
      {initialsOf(name)}
    </span>
  ) : (
    <span role="img" aria-label={alt} className={className}>
      {initialsOf(name)}
    </span>
  );
}
