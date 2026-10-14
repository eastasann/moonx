// The react-pdf constants (ADR-012, ADR-018): `semantic.print`, which refers to the light
// colours only, so the PDF is always light. Sizes are numbers in pt (06: 1px = 1pt).

import {
  flattenTokens,
  isObject,
  type Resolved,
  resolveToken,
  type TokenTree,
} from "./tokens";
import { camelCase, colorValue, GENERATED_HEADER, nest } from "./web-theme";

/** A resolved value as react-pdf takes it. */
function pdfValue(resolved: Resolved): unknown {
  if (resolved.kind === "composite") {
    return Object.fromEntries(
      Object.entries(resolved.fields).map(([field, part]) => [
        field,
        pdfValue(part),
      ]),
    );
  }
  const { type, value } = resolved;
  const record = isObject(value) ? value : {};
  switch (type) {
    case "color":
      return colorValue(record);
    case "dimension":
    case "duration":
      return Number(record.value);
    case "fontFamily":
      return Array.isArray(value) ? value : [value];
    default:
      return value;
  }
}

/** The `semantic.print` tree with camelCase keys and react-pdf values. */
export function printConstants(tree: TokenTree): Record<string, unknown> {
  const tokens = flattenTokens(tree);
  return nest(
    [...tokens.keys()]
      .filter((path) => path.startsWith("semantic.print."))
      .map((path) => [
        path.split(".").slice(2).map(camelCase),
        pdfValue(resolveToken(tokens, path, "medium")),
      ]),
  );
}

/** `src/generated/print.ts`. */
export function printSource(tree: TokenTree): string {
  return `${GENERATED_HEADER}

/**
 * \`semantic.print\` for react-pdf: the Pitch Deck PDF, always light (ADR-012). Sizes are
 * in pt; font families are the names to register with react-pdf, in fallback order.
 */
export const print = ${JSON.stringify(printConstants(tree), null, 2)} as const;
`;
}
