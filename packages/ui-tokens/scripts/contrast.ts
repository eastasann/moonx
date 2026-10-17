// WCAG AA contrast of the semantic colours (design-spec 4.4: text 4.5:1, borders, focus
// and marks 3:1). Every semantic colour must be the foreground of a pair below, a fill
// listed as a background, or exempt, so a colour added to 06 fails until someone decides
// what it is drawn on.

import {
  flattenTokens,
  isObject,
  resolveToken,
  type Token,
  type TokenTree,
} from "./tokens";

/** A colour drawn on each of the backgrounds, and the ratio it needs. */
export interface ContrastPair {
  foreground: string;
  backgrounds: readonly string[];
  minimum: 4.5 | 3;
}

/** Colours no pair checks, and why WCAG does not ask for a ratio. */
export type Exemptions = Readonly<Record<string, string>>;

/** The colours of one group of 06 and how they are checked. */
export interface ContrastScope {
  /** The path prefix of the group, ending in a dot. */
  prefix: string;
  pairs: readonly ContrastPair[];
  /**
   * Fills that only ever lie under other content, so they are checked as backgrounds
   * only: their own edge carries no information or is drawn by a checked colour.
   */
  backgrounds: readonly string[];
  exempt: Exemptions;
}

const SURFACES = [
  "surface.canvas",
  "surface.raised",
  "surface.sunken",
  "surface.overlay",
  "surface.hover",
  "surface.selected",
] as const;

const statusPairs = (status: string, extra: string[] = []): ContrastPair[] => [
  {
    foreground: `${status}.fg`,
    backgrounds: [`${status}.bg`, ...SURFACES],
    minimum: 4.5,
  },
  {
    foreground: `${status}.on-strong`,
    backgrounds: [`${status}.strong`, ...extra],
    minimum: 4.5,
  },
  {
    foreground: `${status}.strong`,
    backgrounds: [`${status}.bg`, ...SURFACES],
    minimum: 3,
  },
  ...extra.map((fill) => ({
    foreground: fill,
    backgrounds: [`${status}.bg`, ...SURFACES],
    minimum: 3 as const,
  })),
];

const fauPairs = (state: string): ContrastPair[] => [
  { foreground: `fau.${state}.fg`, backgrounds: SURFACES, minimum: 4.5 },
  {
    foreground: `fau.${state}.strong`,
    backgrounds: [...SURFACES, "control.track"],
    minimum: 3,
  },
];

/**
 * The pairs checked in both `semantic.color.light` and `semantic.color.dark` (paths
 * relative to the mode).
 */
export const MODE_PAIRS: readonly ContrastPair[] = [
  ...[
    "text.primary",
    "text.secondary",
    "text.tertiary",
    "text.placeholder",
    "text.link",
  ].map((foreground) => ({
    foreground,
    backgrounds: SURFACES,
    minimum: 4.5 as const,
  })),
  // InlineAlert's text is ink on its status fill (s19-decision.html .alert), and its
  // close button a quiet ActionButton in secondary.
  ...["text.primary", "text.secondary"].map((foreground) => ({
    foreground,
    backgrounds: ["informative.bg", "notice.bg", "negative.bg", "neutral.bg"],
    minimum: 4.5 as const,
  })),
  { foreground: "border.strong", backgrounds: SURFACES, minimum: 3 },
  // A field's and a Picker's edge is its border on the control fill; a secondary
  // Button's darkens to it on hover.
  {
    foreground: "border.strong",
    backgrounds: [
      "control.secondary",
      "control.secondary-hover",
      "control.secondary-pressed",
    ],
    minimum: 3,
  },
  { foreground: "border.focus", backgrounds: SURFACES, minimum: 3 },
  // The fill of a primary Button (in each state), a checked Checkbox and the
  // selected-row line.
  ...[
    "control.primary",
    "control.primary-hover",
    "control.primary-pressed",
  ].map((foreground) => ({
    foreground,
    backgrounds: SURFACES,
    minimum: 3 as const,
  })),
  {
    foreground: "control.on-primary",
    backgrounds: [
      "control.primary",
      "control.primary-hover",
      "control.primary-pressed",
    ],
    minimum: 4.5,
  },
  {
    foreground: "control.on-secondary",
    backgrounds: [
      "control.secondary",
      "control.secondary-hover",
      "control.secondary-pressed",
    ],
    minimum: 4.5,
  },
  // A Meter or ProgressBar shows its value by the fill against the track.
  {
    foreground: "control.track-fill",
    backgrounds: ["control.track"],
    minimum: 3,
  },
  ...statusPairs("informative"),
  ...statusPairs("notice"),
  ...statusPairs("negative", [
    "negative.strong-hover",
    "negative.strong-pressed",
  ]),
  ...statusPairs("neutral"),
  ...["fact", "assumption", "unknown", "unclassified"].flatMap(fauPairs),
  { foreground: "fau.empty.fg", backgrounds: SURFACES, minimum: 4.5 },
];

/** The mode fills checked as backgrounds only (see ContrastScope). */
export const MODE_BACKGROUNDS: readonly string[] = [
  ...SURFACES,
  // A field's edge is border.strong, checked on these fills.
  "control.secondary",
  "control.secondary-hover",
  "control.secondary-pressed",
  "control.track",
  // InlineAlert and the notice/negative bands: their ink text and icon carry the meaning.
  "informative.bg",
  "notice.bg",
  "negative.bg",
  "neutral.bg",
];

/** The mode colours no pair checks (same keys in light and dark). */
export const MODE_EXEMPT: Exemptions = {
  "text.disabled": "an inactive control (WCAG 1.4.3 and 1.4.11 exempt it)",
  "control.disabled": "an inactive control (WCAG 1.4.11 exempts it)",
  "border.hairline": "a decorative divider; content is grouped by space too",
  "border.default":
    "the edge of a component its text already identifies (Badge, Button and ActionButton, SegmentedControl's groove, a choice card, an emphasised RowList row, Divider L and the lines over and under tables, the underline of a lone Link): WCAG 1.4.11 asks 3:1 only of what is needed to identify a component (design-spec 4.4)",
  "surface.scrim":
    "the translucent backdrop of a Dialog or Tray, not information",
  "fau.empty.strong":
    "the Meter band of Empty, the same as the track on purpose (06)",
};

/** The pairs checked in `semantic.print.color` (always light). */
export const PRINT_PAIRS: readonly ContrastPair[] = [
  ...["text", "text-secondary", "text-placeholder"].map((foreground) => ({
    foreground,
    backgrounds: ["page", "panel", "table-header"],
    minimum: 4.5 as const,
  })),
  { foreground: "rule", backgrounds: ["page", "panel"], minimum: 3 },
];

/** The print fills checked as backgrounds only. */
export const PRINT_BACKGROUNDS: readonly string[] = [
  "page",
  "panel",
  "table-header",
];

/** The print colours no pair checks. */
export const PRINT_EXEMPT: Exemptions = {
  border: "a decorative table and card line, like border.hairline",
};

/** WCAG 2.2 relative luminance of `#rrggbb`. */
export function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2.2 contrast ratio of two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const SCOPES: readonly ContrastScope[] = [
  ...["light", "dark"].map((mode) => ({
    prefix: `semantic.color.${mode}.`,
    pairs: MODE_PAIRS,
    backgrounds: MODE_BACKGROUNDS,
    exempt: MODE_EXEMPT,
  })),
  {
    prefix: "semantic.print.color.",
    pairs: PRINT_PAIRS,
    backgrounds: PRINT_BACKGROUNDS,
    exempt: PRINT_EXEMPT,
  },
];

/**
 * The contrast problems of the tree: a pair under its ratio, a colour that is neither a
 * checked foreground, a listed background nor exempt, a listed background no pair
 * checks, and a name in this file that 06 does not have.
 * Run validateTokens first; this expects references to resolve.
 */
export function checkContrast(
  tree: TokenTree,
  scopes: readonly ContrastScope[] = SCOPES,
): string[] {
  const tokens = flattenTokens(tree);
  const problems: string[] = [];
  const colours = [...tokens.values()].filter(
    (token: Token) =>
      token.path.startsWith("semantic.") && token.type === "color",
  );
  for (const token of colours) {
    if (!scopes.some(({ prefix }) => token.path.startsWith(prefix))) {
      problems.push(
        `${token.path}: a semantic colour outside the checked groups (scripts/contrast.ts)`,
      );
    }
  }

  for (const { prefix, pairs, backgrounds: fills, exempt } of scopes) {
    const exists = (key: string) => {
      const found = tokens.has(`${prefix}${key}`);
      if (!found) {
        problems.push(
          `${prefix}${key}: named in scripts/contrast.ts but not in 06`,
        );
      }
      return found;
    };
    const hexOf = (key: string): string | undefined => {
      if (!exists(key)) return undefined;
      const path = `${prefix}${key}`;
      const resolved = resolveToken(tokens, path, "medium");
      const value = resolved.kind === "literal" ? resolved.value : undefined;
      if (!isObject(value) || typeof value.hex !== "string") {
        problems.push(`${path}: not a colour`);
        return undefined;
      }
      if (value.alpha !== undefined && value.alpha !== 1) {
        problems.push(
          `${path}: translucent, so its contrast depends on what is behind it`,
        );
        return undefined;
      }
      return value.hex;
    };

    const covered = new Set<string>([...Object.keys(exempt), ...fills]);
    for (const key of Object.keys(exempt)) exists(key);
    const checkedFills = new Set<string>();
    for (const { foreground, backgrounds, minimum } of pairs) {
      covered.add(foreground);
      const fg = hexOf(foreground);
      for (const background of backgrounds) {
        checkedFills.add(background);
        const bg = hexOf(background);
        if (fg === undefined || bg === undefined) continue;
        const ratio = contrastRatio(fg, bg);
        if (ratio < minimum) {
          problems.push(
            `${prefix}${foreground} on ${background}: ${ratio.toFixed(2)}:1, under ${minimum}:1`,
          );
        }
      }
    }
    for (const fill of fills) {
      if (exists(fill) && !checkedFills.has(fill)) {
        problems.push(
          `${prefix}${fill}: listed as a background, but no pair is drawn on it`,
        );
      }
    }
    for (const token of colours) {
      if (!token.path.startsWith(prefix)) continue;
      const key = token.path.slice(prefix.length);
      if (!covered.has(key)) {
        problems.push(
          `${token.path}: neither a checked foreground, a listed background nor exempt (scripts/contrast.ts)`,
        );
      }
    }
  }
  return [...new Set(problems)];
}
