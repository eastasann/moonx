import type { UserRef } from "@moonx/schemas";

/** A run of a comment body: plain text, or the `@Name` of a person it mentions. */
export interface BodyPart {
  text: string;
  mention: boolean;
}

/** `@Name` as it is typed into a comment for a member. */
export const mentionText = (name: string) => `@${name}`;

/**
 * Splits a comment body at the `@Name` of each mentioned person, so the mentions can be marked.
 * A name that is not in the text (the comment was edited) is simply not marked.
 */
export function splitMentions(body: string, mentions: readonly UserRef[]): BodyPart[] {
  const names = [...new Set(mentions.map((m) => mentionText(m.displayName)))].sort(
    (a, b) => b.length - a.length,
  );
  if (names.length === 0) return [{ text: body, mention: false }];
  const pattern = new RegExp(
    `(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  );
  return body
    .split(pattern)
    .filter((text) => text !== "")
    .map((text) => ({ text, mention: names.includes(text) }));
}

/** The ids of the picked people whose `@Name` is still in the text; one who was typed away is not mentioned. */
export function mentionedIds(body: string, picked: readonly Pick<UserRef, "id" | "displayName">[]) {
  return [
    ...new Set(picked.filter((p) => body.includes(mentionText(p.displayName))).map((p) => p.id)),
  ];
}
