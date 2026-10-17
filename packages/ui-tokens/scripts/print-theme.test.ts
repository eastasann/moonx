import { expect, test } from "bun:test";
import { printConstants } from "./print-theme";
import { flattenTokens, isObject, loadTokens } from "./tokens";

const tree = await loadTokens();
const print = printConstants(tree);
const at = (path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (node, key) => (isObject(node) ? node[key] : undefined),
      print,
    );

test("holds every semantic.print token", () => {
  const leaves = (node: unknown): number =>
    isObject(node) && !("fontFamily" in node)
      ? Object.values(node).reduce<number>(
          (sum, child) => sum + leaves(child),
          0,
        )
      : 1;
  const tokens = [...flattenTokens(tree).keys()].filter((path) =>
    path.startsWith("semantic.print."),
  );
  expect(leaves(print)).toBe(tokens.length);
});

test("takes the light colours, as hex", () => {
  expect(at("color.page")).toBe("#ffffff");
  expect(at("color.text")).toBe("#151a2c");
  expect(at("color.textSecondary")).toBe("#555d72");
});

test("writes sizes as pt numbers and fonts as fallback lists", () => {
  expect(at("slide")).toMatchObject({ width: 960, height: 540, marginX: 48 });
  expect(at("fontSize.title")).toMatchObject({ title: 44, titleMin: 32 });
  expect(at("font.mono")).toEqual(["IBM Plex Mono", "IBM Plex Sans JP"]);
  expect(at("typography.figure")).toEqual({
    fontFamily: ["IBM Plex Mono", "IBM Plex Sans JP"],
    fontSize: 48,
    fontWeight: 600,
    letterSpacing: 0,
    lineHeight: 1.25,
  });
});
