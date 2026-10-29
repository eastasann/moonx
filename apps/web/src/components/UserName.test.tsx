import { i18n } from "@moonx/i18n";
import type { UserRef } from "@moonx/schemas";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { UserName, userNameText } from "./UserName";

// A person's name as records keep it (design-spec 6.16・6.17, SDD 5.2 UserRef).

const person = (badge: UserRef["badge"], displayName = "Ana Villanueva") => ({
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  displayName,
  avatarUrl: null,
  badge,
});

const shown = (user: UserRef) => {
  const { container } = render(<UserName user={user} />);
  return container.textContent;
};

describe("UserName", () => {
  test("a member's name alone", () => {
    expect(shown(person(null))).toBe("Ana Villanueva");
  });

  test.each([
    ["former_member", "(former member)"],
    ["suspended", "(suspended)"],
  ] as const)("%s: the name, then its badge", (badge, words) => {
    expect(shown(person(badge))).toBe(`Ana Villanueva ${words}`);
    expect(words).toBe(i18n.t(`app:userBadge.${badge}`));
  });

  test("a deleted account: the catalog's words in place of the name its row holds", () => {
    expect(shown(person("deleted", "Written before"))).toBe(
      i18n.t("app:userBadge.deleted"),
    );
    expect(i18n.t("app:userBadge.deleted")).toBe("Deleted user");
  });
});

describe("userNameText", () => {
  test("the name, its badge's words after it, or the catalog's words for a deleted account", () => {
    expect(userNameText(person(null))).toBe("Ana Villanueva");
    expect(userNameText(person("former_member"))).toBe(
      "Ana Villanueva (former member)",
    );
    expect(userNameText(person("suspended"))).toBe(
      "Ana Villanueva (suspended)",
    );
    expect(userNameText(person("deleted"))).toBe(
      i18n.t("app:userBadge.deleted"),
    );
  });
});
