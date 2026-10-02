import { resolveToken, type TokenMap } from "./dtcg";

/** WCAG AA: text 4.5:1, borders, focus rings and status dots 3:1 (06_design-tokens.json, semantic.color). */
const TEXT = 4.5;
const NON_TEXT = 3;

const SURFACES = ["canvas", "raised", "sunken", "overlay", "hover", "selected"] as const;
const STATUS_FAMILIES = [
  "informative",
  "positive",
  "notice",
  "negative",
  "neutral",
  "seafoam",
  "indigo",
  "purple",
  "pink",
  "brown",
] as const;
const FAU_FAMILIES = [
  "fau.fact",
  "fau.assumption",
  "fau.unknown",
  "fau.unclassified",
  "fau.empty",
  "check.not-started",
  "check.partial",
  "check.done",
  "decision.proceed",
  "decision.hold",
  "decision.drop",
  "decision.undecided",
] as const;

interface Pair {
  foreground: string;
  background: string;
  minimum: number;
}

function pairsFor(): Pair[] {
  const pairs: Pair[] = [];
  const add = (foreground: string, background: string, minimum: number) =>
    pairs.push({ foreground, background, minimum });

  for (const s of SURFACES) {
    add("text.primary", `surface.${s}`, TEXT);
    add("text.secondary", `surface.${s}`, TEXT);
    add("text.link", `surface.${s}`, TEXT);
  }
  for (const s of ["canvas", "raised", "sunken", "overlay"])
    add("border.focus", `surface.${s}`, NON_TEXT);
  add("text.placeholder", "surface.sunken", TEXT);
  for (const state of ["default", "hover", "pressed"])
    add("text.on-accent", `accent.${state}`, TEXT);
  for (const suffix of ["", "-hover", "-pressed"]) {
    add("control.on-primary", `control.primary${suffix}`, TEXT);
    add("control.on-secondary", `control.secondary${suffix}`, TEXT);
  }
  for (const family of STATUS_FAMILIES) {
    add(`${family}.fg`, `${family}.bg`, TEXT);
    add(`${family}.on-strong`, `${family}.strong`, TEXT);
  }
  for (const state of ["hover", "pressed"])
    add("negative.on-strong", `negative.strong-${state}`, TEXT);
  for (const family of FAU_FAMILIES) add(`${family}.fg`, `${family}.bg`, TEXT);

  for (const s of ["canvas", "raised", "sunken"]) add("border.strong", `surface.${s}`, NON_TEXT);
  for (const family of [...STATUS_FAMILIES, ...FAU_FAMILIES]) {
    for (const s of ["canvas", "raised"]) add(`${family}.strong`, `surface.${s}`, NON_TEXT);
  }
  // accent is placed on canvas and raised only (06: semantic.color.*.accent)
  for (const s of ["canvas", "raised"]) {
    add("accent.default", `surface.${s}`, NON_TEXT);
    add("control.primary", `surface.${s}`, NON_TEXT);
  }
  add("control.track-fill", "control.track", NON_TEXT);
  return pairs;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Color groups of semantic.color.light that carry fg and bg and must appear in the pair lists. */
function uncoveredFamilies(tokens: TokenMap): string[] {
  const covered = new Set<string>([...STATUS_FAMILIES, ...FAU_FAMILIES]);
  const found = new Set<string>();
  for (const path of tokens.keys()) {
    const match = /^semantic\.color\.light\.(.+)\.(fg|bg)$/.exec(path);
    if (match) found.add(match[1] as string);
  }
  return [...found].filter((family) => !covered.has(family));
}

/**
 * Returns one message per color pair below its WCAG AA minimum, for both light and dark, and one
 * per color family that the pair lists do not cover.
 */
export function checkContrast(tokens: TokenMap): string[] {
  const errors = uncoveredFamilies(tokens).map(
    (family) =>
      `${family}: color family is not covered by the contrast checks (scripts/contrast.ts)`,
  );
  for (const mode of ["light", "dark"] as const) {
    const hexOf = (name: string): string => {
      const path = `semantic.color.${mode}.${name}`;
      const resolved = resolveToken(tokens, path, "medium");
      if (resolved.kind !== "color") throw new Error(`${path} is not a color`);
      // Ratios are computed on the opaque hex, so a translucent color would be scored as if opaque
      if (resolved.alpha !== 1) throw new Error(`${path} is translucent and cannot be checked`);
      return resolved.hex;
    };
    for (const { foreground, background, minimum } of pairsFor()) {
      const ratio = contrastRatio(hexOf(foreground), hexOf(background));
      if (ratio < minimum) {
        errors.push(
          `${mode}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1 (needs ${minimum}:1)`,
        );
      }
    }
  }
  return errors;
}
