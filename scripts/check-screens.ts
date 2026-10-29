import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "@babel/parser";
import type { JSXAttribute, JSXOpeningElement, Node } from "@babel/types";

/** One rule violation. `line` and `column` are 1-based, as editors and CI logs expect. */
export interface Finding {
  file: string;
  line: number;
  column: number;
  message: string;
}

/**
 * Props that hold an identifier on every component: a key, an id, a path, a code
 * (`currency`), a token list. Each is declared as a string (or `Key`) somewhere in the
 * parts or the screens, and never as something shown (check-screens.test.ts reads the
 * declarations in packages/ui-web and apps/web to hold this).
 */
export const KEY_PROPS: ReadonlySet<string> = new Set([
  "acceptedFileTypes",
  "autoComplete",
  "className",
  "currency",
  "currentId",
  "defaultExpandedKeys",
  "defaultSelectedKey",
  "disabledKeys",
  "expandedKeys",
  "form",
  "from",
  "hash",
  "href",
  "id",
  "ideaId",
  "item",
  "key",
  "listPath",
  "params",
  "questionIds",
  "rel",
  "saveScope",
  "search",
  "selectedKey",
  "selectedKeys",
  "slot",
  "src",
  "target",
  "to",
]);

/**
 * Props that hold one of a fixed set of values on every component (the parts' `variant`,
 * `tone`, `size`…, a screen's `current` or `kind`): TypeScript holds a literal to the set,
 * and a part names a value from the catalog rather than show it. None is declared as a
 * string or as something shown (check-screens.test.ts holds this).
 */
export const ENUM_PROPS: ReadonlySet<string> = new Set([
  "align",
  "alignItems",
  "autoFocusButton",
  "column",
  "columnGap",
  "current",
  "density",
  "descriptionTone",
  "disabledBehavior",
  "elementType",
  "field",
  "fillStyle",
  "gap",
  "inputMode",
  "justifyContent",
  "kind",
  "labelPosition",
  "layout",
  "mode",
  "orientation",
  "role",
  "rowGap",
  "selectionMode",
  "size",
  "slideKey",
  "state",
  "supplementTone",
  "tab",
  "tone",
  "transient",
  "type",
  "unclassified",
  "variant",
  "view",
  "width",
]);

/**
 * Props that hold a key only on the parts named here, decided from packages/ui-web's
 * prop types: a form field's `name` (the field it submits as), the `value` and
 * `defaultValue` of a choice (the chosen item's id, an ISO date). On any other component
 * they are shown (Avatar's and IdeaPreview's `name`, MetricTile's `value`, a TextField's
 * typed `value`), and so they are text. `AppField` is TanStack Form's field, written
 * `form.AppField`, whose `name` is the path of the value it binds.
 */
export const PART_KEY_PROPS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries({
    AppField: ["name"],
    Checkbox: ["name", "value"],
    CheckboxGroup: ["name", "value", "defaultValue"],
    ComboBox: ["name", "value", "defaultValue"],
    DatePicker: ["name", "value", "defaultValue"],
    DiffTextArea: ["name"],
    MentionTextArea: ["name"],
    NumberField: ["name"],
    Picker: ["name", "value", "defaultValue"],
    Radio: ["value"],
    RadioGroup: ["name", "value", "defaultValue"],
    SearchField: ["name"],
    Switch: ["name", "value"],
    TextArea: ["name"],
    TextField: ["name"],
  }).map(([part, props]) => [part, new Set(props)]),
);

/**
 * The HTML attributes that hold identifiers, on lowercase (HTML) elements. Their other
 * attributes (`title`, `alt`, `placeholder`…) are text, and so is every prop of a
 * component that is not named above.
 */
const HTML_IDENTIFIER_ATTRIBUTES: ReadonlySet<string> = new Set([
  "accept",
  "action",
  "autoComplete",
  "className",
  "dir",
  "download",
  "encType",
  "enterKeyHint",
  "form",
  "href",
  "htmlFor",
  "id",
  "inputMode",
  "key",
  "lang",
  "method",
  "name",
  "rel",
  "role",
  "slot",
  "src",
  "tabIndex",
  "target",
  "type",
  "value",
]);

/**
 * Identifiers whose value is a list of tokens separated by spaces (HTML); so may be an
 * `aria-*` attribute's that holds no text (`aria-labelledby`) and a `data-*`'s.
 */
const TOKEN_LIST_PROPS: ReadonlySet<string> = new Set([
  "autoComplete",
  "className",
  "rel",
]);

/**
 * The ARIA attributes that hold text (WAI-ARIA 1.3). The other `aria-*` attributes hold
 * ids, numbers and tokens, and `data-*` attributes are never shown.
 */
const ARIA_TEXT_PROPS: ReadonlySet<string> = new Set([
  "aria-braillelabel",
  "aria-brailleroledescription",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
]);

/**
 * What an identifier looks like: no spaces and nothing outside ASCII. A literal of another
 * shape where an identifier goes is text all the same (`<Radio value="Not shared" />`).
 */
const IDENTIFIER_SHAPE = /^[\w.,:/?#=&%+@~$-]*$/;
const TOKEN_LIST_SHAPE = /^[\w\s.,:/?#=&%+@~$-]*$/;

const STYLE_MESSAGE =
  "style attribute: build the look from packages/ui-web components instead (ADR-025)";
const CATALOG = "put UI text in the packages/i18n catalog (SDD 9章)";

type Receiver = "text" | "identifier" | "tokens";

/** The element a prop is given to: its name, the last one of `form.AppField`. */
interface Owner {
  name: string;
  /** A lowercase (HTML) element, as React tells them from components. */
  isHtml: boolean;
}

/**
 * How a prop receives a literal: given to `element`, or (`null`) as a key of an object
 * literal inside another prop. A prop no list names is text. The lists name identifiers
 * rather than text props so that the check fails closed: a part's new text prop
 * (`primaryActionLabel`, `heading`, `unit`…) is checked from the day it is added, and a
 * new identifier prop shows up as a finding, to be listed on purpose.
 */
function receiverOf(prop: string, element: Owner | null): Receiver {
  if (TOKEN_LIST_PROPS.has(prop) || prop.startsWith("data-")) return "tokens";
  if (prop.startsWith("aria-"))
    return ARIA_TEXT_PROPS.has(prop) ? "text" : "tokens";
  if (element?.isHtml) {
    return HTML_IDENTIFIER_ATTRIBUTES.has(prop) ? "identifier" : "text";
  }
  if (KEY_PROPS.has(prop) || ENUM_PROPS.has(prop)) return "identifier";
  if (element !== null && PART_KEY_PROPS.get(element.name)?.has(prop))
    return "identifier";
  return "text";
}

function hasText(value: string | null | undefined): boolean {
  return value != null && value.trim() !== "";
}

/** Whether a literal with this text, given to this receiver, is UI text. */
function isUiText(text: string, receiver: Receiver): boolean {
  if (!hasText(text)) return false;
  switch (receiver) {
    case "text":
      return true;
    case "identifier":
      return !IDENTIFIER_SHAPE.test(text);
    case "tokens":
      return !TOKEN_LIST_SHAPE.test(text);
  }
}

/** Where a literal goes: an element's child (`null`), or a prop and the keys inside it. */
interface Target {
  /** The prop, then the object keys: `addItem.label`. */
  path: string;
  receiver: Receiver;
}

/** A literal found as UI text. */
interface TextLiteral {
  node: Node;
  target: Target | null;
}

/**
 * The string and template literals an expression evaluates to directly, as UI text.
 *
 * It follows both branches of `?:`, `&&`, `||` and `??`, both sides of `+`, casts, the
 * elements of an array literal, the values of an object literal (each received by its key,
 * unless the object is itself an identifier prop's value, as `search={{ filter }}` is) and
 * the result of an arrow function without braces (a render prop). It stops at calls
 * (`t("key")`, `formatMoney()`), variables, and functions with a body. `owner` is the
 * element whose props an object spread into it (`{...{ name }}`) holds.
 */
function textLiterals(
  expression: Node,
  target: Target | null,
  owner: Owner | null = null,
): TextLiteral[] {
  const receiver = target?.receiver ?? "text";
  const each = (inner: Node) => textLiterals(inner, target, owner);
  switch (expression.type) {
    case "StringLiteral":
      return isUiText(expression.value, receiver)
        ? [{ node: expression, target }]
        : [];
    case "TemplateLiteral": {
      const text = expression.quasis
        .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
        .join("");
      return isUiText(text, receiver) ? [{ node: expression, target }] : [];
    }
    case "ConditionalExpression":
      return [...each(expression.consequent), ...each(expression.alternate)];
    case "LogicalExpression":
      return [...each(expression.left), ...each(expression.right)];
    case "BinaryExpression":
      return expression.operator === "+"
        ? [...each(expression.left), ...each(expression.right)]
        : [];
    case "ParenthesizedExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "SpreadElement":
      return each(
        expression.type === "SpreadElement"
          ? expression.argument
          : expression.expression,
      );
    case "ArrayExpression":
      return expression.elements.flatMap((element) =>
        element === null ? [] : textLiterals(element, target),
      );
    case "ObjectExpression":
      return expression.properties.flatMap((property) => {
        if (property.type === "SpreadElement") return each(property.argument);
        if (property.type !== "ObjectProperty") return [];
        const key = property.computed ? null : keyName(property.key);
        const inner: Target | null =
          receiver !== "text" || key === null
            ? target
            : {
                path: target === null ? key : `${target.path}.${key}`,
                receiver: receiverOf(key, target === null ? owner : null),
              };
        return textLiterals(property.value, inner);
      });
    case "ArrowFunctionExpression":
      return expression.body.type === "BlockStatement"
        ? []
        : textLiterals(expression.body, target);
    default:
      return [];
  }
}

/** An object literal's key as written, or `null` for a key that is not a plain name. */
function keyName(key: Node): string | null {
  switch (key.type) {
    case "Identifier":
      return key.name;
    case "StringLiteral":
      return key.value;
    default:
      return null;
  }
}

function textMessage(target: Target | null): string {
  return target === null
    ? `raw string in JSX: ${CATALOG}`
    : `raw string in JSX prop ${target.path}: ${CATALOG}`;
}

function ownerOf(name: JSXOpeningElement["name"]): Owner {
  switch (name.type) {
    case "JSXIdentifier":
      // React's rule: a lowercase name is an HTML element, any other a component.
      return { name: name.name, isHtml: /^[a-z]/.test(name.name) };
    case "JSXMemberExpression":
      return { name: name.property.name, isHtml: false };
    case "JSXNamespacedName":
      return { name: `${name.namespace.name}:${name.name.name}`, isHtml: true };
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
 * Raw strings are non-blank JSX text, and the literals (see `textLiterals`) placed as an
 * element's children or given to its props, except identifiers where {@link receiverOf}
 * takes one: {@link KEY_PROPS} and {@link ENUM_PROPS}, {@link PART_KEY_PROPS} on their
 * parts, an HTML element's identifier attributes, and the ARIA attributes that do not
 * hold text and `data-*`.
 * Strings reached through variables or calls are out of reach for a syntax check and are
 * left to review.
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
  const reportText = (
    expression: Node,
    target: Target | null,
    owner: Owner | null = null,
  ) => {
    for (const literal of textLiterals(expression, target, owner))
      report(literal.node, textMessage(literal.target));
  };

  const visit = (node: Node): void => {
    switch (node.type) {
      case "JSXOpeningElement": {
        const element = ownerOf(node.name);
        for (const attribute of node.attributes) {
          if (attribute.type === "JSXSpreadAttribute") {
            reportText(attribute.argument, null, element);
            continue;
          }
          const name = attributeName(attribute);
          if (name === "style") {
            report(attribute, STYLE_MESSAGE);
          } else if (attribute.value != null) {
            reportText(
              attribute.value.type === "JSXExpressionContainer"
                ? attribute.value.expression
                : attribute.value,
              { path: name, receiver: receiverOf(name, element) },
            );
          }
        }
        break;
      }
      case "JSXText":
        if (hasText(node.value)) report(node, textMessage(null));
        break;
      case "JSXElement":
      case "JSXFragment":
        for (const child of node.children) {
          if (child.type === "JSXExpressionContainer")
            reportText(child.expression, null);
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
