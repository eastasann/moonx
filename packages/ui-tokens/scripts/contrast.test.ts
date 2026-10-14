import { describe, expect, test } from "bun:test";
import {
  type ContrastPair,
  type ContrastScope,
  checkContrast,
  contrastRatio,
  type Exemptions,
} from "./contrast";
import { loadTokens, type TokenTree } from "./tokens";

describe("contrastRatio", () => {
  test.each([
    ["#000000", "#ffffff", 21],
    ["#ffffff", "#ffffff", 1],
    // WCAG's own example of the AA limit for text.
    ["#767676", "#ffffff", 4.54],
  ])("%s on %s is %d:1", (a, b, ratio) => {
    expect(contrastRatio(a, b)).toBeCloseTo(ratio, 2);
    expect(contrastRatio(b, a)).toBeCloseTo(ratio, 2);
  });
});

const color = (hex: string, alpha?: number) => ({
  $value: {
    colorSpace: "srgb",
    components: [1, 3, 5].map(
      (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
    ),
    ...(alpha === undefined ? {} : { alpha }),
    hex,
  },
});

const tree = (semantic: Record<string, unknown>): TokenTree => ({
  primitive: {
    color: {
      $type: "color",
      black: color("#000000"),
      white: color("#ffffff"),
      grey: color("#999999"),
      veil: color("#000000", 0.4),
    },
  },
  semantic: { color: { $type: "color", light: semantic } },
});
const ref = (name: string) => ({ $value: `{primitive.color.${name}}` });

const scope = (
  pairs: ContrastPair[],
  exempt: Exemptions = {},
  backgrounds = ["page"],
): ContrastScope[] => [
  { prefix: "semantic.color.light.", pairs, backgrounds, exempt },
];

describe("checkContrast", () => {
  test("accepts 06 with the pairs of design-spec 4.4", async () => {
    expect(checkContrast(await loadTokens())).toEqual([]);
  });

  test("accepts pairs at their ratio", () => {
    expect(
      checkContrast(
        tree({ text: ref("black"), page: ref("white") }),
        scope([{ foreground: "text", backgrounds: ["page"], minimum: 4.5 }]),
      ),
    ).toEqual([]);
  });

  test("reports a pair under its ratio", () => {
    expect(
      checkContrast(
        tree({ text: ref("grey"), page: ref("white") }),
        scope([{ foreground: "text", backgrounds: ["page"], minimum: 4.5 }]),
      ),
    ).toEqual(["semantic.color.light.text on page: 2.85:1, under 4.5:1"]);
  });

  test("reports a colour that no pair or exemption covers", () => {
    expect(
      checkContrast(
        tree({ text: ref("black"), page: ref("white"), added: ref("grey") }),
        scope([{ foreground: "text", backgrounds: ["page"], minimum: 4.5 }]),
      ),
    ).toEqual([
      "semantic.color.light.added: neither a checked foreground, a listed background nor exempt (scripts/contrast.ts)",
    ]);
  });

  test("reports a colour drawn on but never checked as a foreground", () => {
    // A hover fill is itself drawn on the page, so being a background is not enough.
    expect(
      checkContrast(
        tree({ text: ref("black"), page: ref("white"), hover: ref("grey") }),
        scope([
          { foreground: "text", backgrounds: ["page", "hover"], minimum: 3 },
        ]),
      ),
    ).toEqual([
      "semantic.color.light.hover: neither a checked foreground, a listed background nor exempt (scripts/contrast.ts)",
    ]);
  });

  test("reports a listed background that no pair is drawn on", () => {
    expect(
      checkContrast(
        tree({ text: ref("black"), page: ref("white"), well: ref("white") }),
        scope(
          [{ foreground: "text", backgrounds: ["page"], minimum: 4.5 }],
          {},
          ["page", "well"],
        ),
      ),
    ).toEqual([
      "semantic.color.light.well: listed as a background, but no pair is drawn on it",
    ]);
  });

  test("accepts an exempt colour", () => {
    expect(
      checkContrast(
        tree({ text: ref("black"), page: ref("white"), rule: ref("grey") }),
        scope([{ foreground: "text", backgrounds: ["page"], minimum: 4.5 }], {
          rule: "decorative",
        }),
      ),
    ).toEqual([]);
  });

  test("reports a pair or exemption naming a colour that is gone", () => {
    expect(
      checkContrast(
        tree({ text: ref("black") }),
        scope([{ foreground: "text", backgrounds: ["page"], minimum: 4.5 }], {
          rule: "decorative",
        }),
      ),
    ).toEqual([
      "semantic.color.light.rule: named in scripts/contrast.ts but not in 06",
      "semantic.color.light.page: named in scripts/contrast.ts but not in 06",
    ]);
  });

  test("reports a translucent colour in a pair", () => {
    expect(
      checkContrast(
        tree({ text: ref("veil"), page: ref("white") }),
        scope([{ foreground: "text", backgrounds: ["page"], minimum: 3 }]),
      ),
    ).toEqual([
      "semantic.color.light.text: translucent, so its contrast depends on what is behind it",
    ]);
  });

  test("reports a pair member that is not a colour", () => {
    const broken = tree({ text: ref("black") });
    (broken.primitive as Record<string, unknown>).size = {
      $type: "dimension",
      m: { $value: { value: 14, unit: "px" } },
    };
    (
      (broken.semantic as Record<string, Record<string, unknown>>).color
        ?.light as Record<string, unknown>
    ).page = { $value: "{primitive.size.m}" };
    expect(
      checkContrast(
        broken,
        scope([{ foreground: "text", backgrounds: ["page"], minimum: 4.5 }]),
      ),
    ).toEqual(["semantic.color.light.page: not a colour"]);
  });

  test("reports a semantic colour outside the checked groups", () => {
    const problems = checkContrast({
      ...tree({}),
      semantic: {
        chart: { $type: "color", line: ref("black") },
      },
    });
    expect(problems).toContain(
      "semantic.chart.line: a semantic colour outside the checked groups (scripts/contrast.ts)",
    );
  });
});
