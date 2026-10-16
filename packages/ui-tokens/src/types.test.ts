import { describe, expect, test } from "bun:test";
import { flattenTokens, loadTokens } from "../scripts/tokens";
import {
  avatarSizes,
  breadcrumbsSizes,
  colorSchemes,
  contextualHelpSizes,
  densities,
  dialogSizes,
  dialogWidths,
  dividerSizes,
  fauStates,
  iconSizes,
  illustratedMessageSizes,
  popoverSizes,
  progressCircleSizes,
  scales,
  sizes,
  sizesWithXS,
  spaces,
  statusVariants,
  tagSizes,
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
    [
      "progressCircleSizes",
      progressCircleSizes,
      "semantic.scale.medium.component.progress-circle.size",
    ],
    [
      "progressCircleSizes",
      progressCircleSizes,
      "semantic.scale.medium.component.progress-circle.thickness",
    ],
    ["dividerSizes", dividerSizes, "semantic.border-width.divider"],
    ...["height", "padding-x", "padding-icon-only", "font-size"].map(
      (dimension) =>
        [
          "sizesWithXS",
          sizesWithXS,
          `semantic.scale.medium.component.action-button.${dimension}`,
        ] as const,
    ),
    ...["height", "padding-x", "font-size"].map(
      (dimension) =>
        [
          "tagSizes",
          tagSizes,
          `semantic.scale.medium.component.tag.${dimension}`,
        ] as const,
    ),
    ...["height", "font-size", "gap"].map(
      (dimension) =>
        [
          "breadcrumbsSizes",
          breadcrumbsSizes,
          `semantic.scale.medium.component.breadcrumbs.${dimension}`,
        ] as const,
    ),
    ...["icon-size", "title-font-size", "body-font-size"].map(
      (dimension) =>
        [
          "illustratedMessageSizes",
          illustratedMessageSizes,
          `semantic.scale.medium.component.illustrated-message.${dimension}`,
        ] as const,
    ),
    ["dialogWidths", dialogWidths, "semantic.layout.dialog-max-width"],
    [
      "popoverSizes",
      popoverSizes,
      "semantic.scale.medium.component.popover.width",
    ],
    ["fauStates", fauStates, "semantic.color.light.fau"],
  ])("%s", (_, list, prefix) => {
    expect(keysAfter(prefix)).toEqual([...list]);
  });

  test("Dialog sizes are the widths and fullscreen", () => {
    expect([...dialogSizes]).toEqual([...dialogWidths, "fullscreen"]);
  });

  test("ContextualHelp sizes are steps of action-button, which draws its button", () => {
    for (const size of contextualHelpSizes) {
      expect(sizesWithXS).toContain(size);
    }
  });

  test("spaces are semantic.space by name", () => {
    expect(keysAfter("semantic.space").map((key) => `space-${key}`)).toEqual([
      ...spaces,
    ]);
  });

  test("sizes are the keys of every component dimension sized S to XL", () => {
    // Groups such as icon.size (XS–XL), action-button (XS–XL), avatar.size (S–M), tag,
    // progress-circle, popover and illustrated-message (S–L) and breadcrumbs (M–L) have
    // their own lists.
    const groups = paths
      .filter((path) =>
        /^semantic\.scale\.medium\.component\.[^.]+\.[^.]+\.(S|M|L|XL)$/.test(
          path,
        ),
      )
      .map((path) => path.slice(0, path.lastIndexOf(".")));
    const sized = [...new Set(groups)].filter(
      (group) =>
        !group.endsWith(".icon.size") &&
        !group.endsWith(".avatar.size") &&
        !group.includes(".action-button.") &&
        !group.includes(".tag.") &&
        !group.includes(".progress-circle.") &&
        !group.includes(".breadcrumbs.") &&
        !group.includes(".popover.") &&
        !group.includes(".illustrated-message."),
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
