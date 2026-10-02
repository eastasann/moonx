import { expect, test } from "vitest";
import { mentionedIds, splitMentions } from "../src/lib/comment-text";

const ana = { id: "a", displayName: "Ana Villanueva", avatarUrl: null, badge: null };
const paolo = { id: "p", displayName: "Paolo Reyes", avatarUrl: null, badge: null };

test("mentions are split out of the body in order", () => {
  expect(splitMentions("Hi @Ana Villanueva and @Paolo Reyes!", [ana, paolo])).toEqual([
    { text: "Hi ", mention: false },
    { text: "@Ana Villanueva", mention: true },
    { text: " and ", mention: false },
    { text: "@Paolo Reyes", mention: true },
    { text: "!", mention: false },
  ]);
});

test("a body without mentions, or whose mention was edited away, stays plain", () => {
  expect(splitMentions("No one", [])).toEqual([{ text: "No one", mention: false }]);
  expect(splitMentions("Hi Ana", [ana])).toEqual([{ text: "Hi Ana", mention: false }]);
});

test("a name with regex characters is matched literally", () => {
  const odd = { ...ana, displayName: "A. (Ana) +1" };
  expect(splitMentions("Hi @A. (Ana) +1", [odd]).at(-1)).toEqual({
    text: "@A. (Ana) +1",
    mention: true,
  });
});

test("only picked people whose @Name is still in the text are mentioned, once each", () => {
  expect(mentionedIds("@Paolo Reyes please, @Paolo Reyes", [paolo, paolo, ana])).toEqual(["p"]);
  expect(mentionedIds("no mention left", [paolo])).toEqual([]);
});
