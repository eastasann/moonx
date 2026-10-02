/**
 * Finds what Biome cannot see in screen code (ADR-022, ADR-025, SDD 9):
 * `style` attributes and raw text in JSX. Screens are `apps/web/src` and `apps/mobile/app`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const SCREEN_DIRS = ["apps/web/src", "apps/mobile/app"];
const TEXT_ATTRIBUTES = new Set([
  "title",
  "placeholder",
  "alt",
  "aria-label",
  "aria-description",
  "accessibilityLabel",
  "accessibilityHint",
  "label",
]);
const hasText = (text: string) => /\p{L}/u.test(text.replace(/&#?\w+;/g, ""));
const isStringLike = (node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

export interface Finding {
  file: string;
  line: number;
  message: string;
}

export function checkSource(file: string, source: string): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const report = (node: ts.Node, message: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    findings.push({ file, line: line + 1, message });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasText(node.text)) {
      report(node, "raw text in JSX; put it in the packages/i18n catalog (SDD 9)");
    }
    if (
      ts.isJsxExpression(node) &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
      node.expression &&
      isStringLike(node.expression) &&
      hasText(node.expression.text)
    ) {
      report(node, "string literal in a JSX child; put it in the packages/i18n catalog (SDD 9)");
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      if (name === "style") {
        report(node, "style attribute in a screen; use a packages/ui-* component (ADR-025)");
      } else if (
        TEXT_ATTRIBUTES.has(name) &&
        node.initializer &&
        (isStringLike(node.initializer) ||
          (ts.isJsxExpression(node.initializer) &&
            node.initializer.expression &&
            isStringLike(node.initializer.expression))) &&
        hasText(
          ts.isJsxExpression(node.initializer)
            ? (node.initializer.expression as ts.StringLiteral).text
            : (node.initializer as ts.StringLiteral).text,
        )
      ) {
        report(node, `raw string in the ${name} attribute; put it in the packages/i18n catalog`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith(".tsx")) yield path;
  }
}

if (import.meta.main) {
  const findings = SCREEN_DIRS.flatMap((dir) =>
    [...walk(dir)].flatMap((file) => checkSource(file, readFileSync(file, "utf8"))),
  );
  for (const f of findings) console.error(`${f.file}:${f.line}: ${f.message}`);
  process.exit(findings.length > 0 ? 1 : 0);
}
