import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkContrast } from "./contrast";
import { checkAliases, collectTokens, type JsonObject } from "./dtcg";
import { emitNative, emitPrint, emitWeb } from "./emit";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../../docs/06_design-tokens.json");
const outDir = resolve(here, "../src/generated");

const tokens = collectTokens(JSON.parse(readFileSync(source, "utf8")) as JsonObject);

const errors = [...checkAliases(tokens)];
if (errors.length === 0) errors.push(...checkContrast(tokens));
if (errors.length > 0) {
  console.error(
    `docs/06_design-tokens.json failed the token checks:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "web.css.ts"), emitWeb(tokens));
writeFileSync(resolve(outDir, "native.ts"), emitNative(tokens));
writeFileSync(resolve(outDir, "print.ts"), emitPrint(tokens));
console.log(`Generated ${tokens.size} tokens into packages/ui-tokens/src/generated`);
