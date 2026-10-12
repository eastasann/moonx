import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "@babel/parser";
import type { Expression, JSXAttribute, Node } from "@babel/types";

/** One rule violation. `line` and `column` are 1-based, as editors and CI logs expect. */
export interface Finding {
  file: string;
  line: number;
  column: number;
  message: string;
}

/**
 * Props whose string value is shown to people or read by screen readers. Other props
 * (`variant="primary"`, `gap="space-300"`, `href`) take identifiers, not UI text, so
 * their literals are allowed.
 */
export const TEXT_PROPS: ReadonlySet<string> = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "children",
  "description",
  "errorMessage",
  "label",
  "placeholder",
  "title",
]);

const STYLE_MESSAGE =
  "style attribute: build the look from packages/ui-web components instead (ADR-025)";
const TEXT_MESSAGE =
  "raw string in JSX: put UI text in the packages/i18n catalog (SDD 9章)";

function hasText(value: string | null | undefined): boolean {
  return value != null && value.trim() !== "";
}

/** String and template literals an expression can evaluate to directly. */
function textLiterals(expression: Node): Node[] {
  switch (expression.type) {
    case "StringLiteral":
      return hasText(expression.value) ? [expression] : [];
    case "TemplateLiteral":
      return expression.quasis.some((quasi) =>
        hasText(quasi.value.cooked ?? quasi.value.raw),
      )
        ? [expression]
        : [];
    case "ConditionalExpression":
      return [
        ...textLiterals(expression.consequent),
        ...textLiterals(expression.alternate),
      ];
    case "LogicalExpression":
      return [
        ...textLiterals(expression.left),
        ...textLiterals(expression.right),
      ];
    case "ParenthesizedExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
      return textLiterals(expression.expression);
    default:
      return [];
  }
}

function attributeName(attribute: JSXAttribute): string {
  const { name } = attribute;
  return name.type === "JSXIdentifier"
    ? name.name
    : `${name.namespace.name}:${name.name.name}`;
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Node).type === "string"
  );
}

/**
 * Finds `style` attributes and raw UI strings in one TSX or JSX source file.
 *
 * Raw strings are non-blank JSX text, string or template literals placed directly as
 * children (including both branches of `?:`, `&&`, `||`, `??`), and literals given to
 * {@link TEXT_PROPS}. Strings reached through variables are out of reach for a syntax
 * check and are left to review.
 */
export function checkSource(code: string, file: string): Finding[] {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const findings: Finding[] = [];
  const report = (node: Node, message: string) => {
    const start = node.loc?.start;
    // Babel always records locations; a finding without one could not be acted on.
    if (start === undefined)
      throw new Error(`${file}: ${node.type} has no location`);
    findings.push({
      file,
      line: start.line,
      column: start.column + 1,
      message,
    });
  };

  const visit = (node: Node): void => {
    switch (node.type) {
      case "JSXAttribute": {
        const name = attributeName(node);
        if (name === "style") {
          report(node, STYLE_MESSAGE);
        } else if (TEXT_PROPS.has(name) && node.value != null) {
          const value =
            node.value.type === "JSXExpressionContainer"
              ? node.value.expression
              : node.value;
          for (const literal of textLiterals(value))
            report(literal, TEXT_MESSAGE);
        }
        break;
      }
      case "JSXText":
        if (hasText(node.value)) report(node, TEXT_MESSAGE);
        break;
      case "JSXElement":
      case "JSXFragment":
        for (const child of node.children) {
          if (child.type === "JSXExpressionContainer") {
            for (const literal of textLiterals(
              child.expression as Expression,
            )) {
              report(literal, TEXT_MESSAGE);
            }
          }
        }
        break;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key.endsWith("Comments")) continue;
      if (Array.isArray(value)) {
        for (const item of value) if (isNode(item)) visit(item);
      } else if (isNode(value)) {
        visit(value);
      }
    }
  };

  visit(ast.program);
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Screen sources under `dir`: TSX and JSX files, excluding tests, which ship no UI. */
export function screenFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter(
      (path) =>
        /\.(tsx|jsx)$/.test(path) && !/\.(test|spec)\.(tsx|jsx)$/.test(path),
    )
    .map((path) => join(dir, path))
    .sort();
}

/** Checks every screen file under `dir`; paths in findings are relative to `cwd`. */
export function checkScreens(
  dir: string,
  cwd: string = process.cwd(),
): Finding[] {
  return screenFiles(dir).flatMap((path) =>
    checkSource(readFileSync(path, "utf8"), relative(cwd, path)),
  );
}

if (import.meta.main) {
  const dir = process.argv[2] ?? "apps/web/src";
  const findings = checkScreens(dir);
  for (const finding of findings) {
    console.error(
      `${finding.file}:${finding.line}:${finding.column} ${finding.message}`,
    );
  }
  if (findings.length > 0) {
    console.error(`check-screens: ${findings.length} problem(s) in ${dir}`);
    process.exit(1);
  }
}
