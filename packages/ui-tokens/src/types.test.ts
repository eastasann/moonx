import { describe, expect, test } from "bun:test";
import { flattenTokens, loadTokens } from "../scripts/tokens";
import {
  avatarSizes,
  colorSchemes,
  densities,
  dialogWidths,
  dividerSizes,
  fauStates,
  iconSizes,
  scales,
  sizes,
  spaces,
  statusVariants,
} from "./types";

const paths = [...flattenTokens(await loadTokens()).keys()];

/** The distinct path segments right after `prefix`, in 06's order. */
const keysAfter = (prefix: string) => [
  ...new Set(
    paths
      .filter((path) => path.startsWith(`${prefix}.`))
      .map((path) => path.slice(prefix.length + 1).split(".")[0] ?? ""),
  ),
];

describe("types.ts matches docs/06_design-tokens.json", () => {
  test.each([
    ["colorSchemes", colorSchemes, "semantic.color"],
    ["scales", scales, "semantic.scale"],
    ["densities", densities, "semantic.density"],
    ["iconSizes", iconSizes, "semantic.scale.medium.component.icon.size"],
    ["avatarSizes", avatarSizes, "semantic.scale.medium.component.avatar.size"],
    ["dividerSizes", dividerSizes, "semantic.border-width.divider"],
    ["dialogWidths", dialogWidths, "semantic.layout.dialog-max-width"],
    ["fauStates", fauStates, "semantic.color.light.fau"],
  ])("%s", (_, list, prefix) => {
    expect(keysAfter(prefix)).toEqual([...list]);
  });

  test("spaces are semantic.space by name", () => {
    expect(keysAfter("semantic.space").map((key) => `space-${key}`)).toEqual([
      ...spaces,
    ]);
  });

  test("sizes are the keys of every component dimension sized S to XL", () => {
    // Groups such as icon.size (XS–XL) and avatar.size (S–M) have their own lists.
    const groups = paths
      .filter((path) =>
        /^semantic\.scale\.medium\.component\.[^.]+\.[^.]+\.(S|M|L|XL)$/.test(
          path,
        ),
      )
      .map((path) => path.slice(0, path.lastIndexOf(".")));
    const sized = [...new Set(groups)].filter(
      (group) =>
        !group.endsWith(".icon.size") && !group.endsWith(".avatar.size"),
    );
    expect(sized.length).toBeGreaterThan(0);
    for (const group of sized) {
      expect({ group, keys: keysAfter(group) }).toEqual({
        group,
        keys: [...sizes],
      });
    }
  });

  test("statusVariants are the colour groups with fg, bg, strong and on-strong", () => {
    for (const mode of colorSchemes) {
      const statusGroups = keysAfter(`semantic.color.${mode}`).filter((group) =>
        ["fg", "bg", "strong", "on-strong"].every((key) =>
          paths.includes(`semantic.color.${mode}.${group}.${key}`),
        ),
      );
      expect(statusGroups).toEqual([...statusVariants]);
    }
  });
});
