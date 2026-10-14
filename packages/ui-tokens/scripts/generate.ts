// make tokens: checks docs/06_design-tokens.json and writes packages/ui-tokens/src/generated/
// from it (ADR-018, ADR-031). Nothing is written when a check fails.

import { checkContrast } from "./contrast";
import { buildOutputs, GENERATED_DIR, writeOutputs } from "./outputs";
import { loadTokens, TOKENS_PATH, validateTokens } from "./tokens";

const tree = await loadTokens();
// Contrast resolves references, which only works on a tree that passed validation.
const invalid = validateTokens(tree);
const problems = invalid.length > 0 ? invalid : checkContrast(tree);
if (problems.length > 0) {
  console.error(`${TOKENS_PATH}:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const changed = writeOutputs(await buildOutputs(tree));
console.log(
  changed.length === 0
    ? `${GENERATED_DIR} is up to date`
    : `${GENERATED_DIR}: ${changed.join(", ")}`,
);
