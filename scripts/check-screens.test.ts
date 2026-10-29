import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "@babel/parser";
import type { Node } from "@babel/types";
import {
  checkScreens,
  checkSource,
  ENUM_PROPS,
  KEY_PROPS,
  PART_KEY_PROPS,
} from "./check-screens";

const messages = (code: string) =>
  checkSource(code, "screen.tsx").map(({ line, column, message }) => ({
    line,
    column,
    kind: message.startsWith("style") ? "style" : "text",
  }));

describe("style attributes", () => {
  test.each([
    ["an object", "<div style={{ color: 'red' }} />"],
    ["a variable", "<Box style={styles} />"],
    ["a string", '<div style="color: red" />'],
  ])("reports %s", (_, jsx) => {
    expect(messages(`const a = ${jsx};`)).toEqual([
      { line: 1, column: 16, kind: "style" },
    ]);
  });

  test("allows other props", () => {
    expect(
      messages('const a = <Flex gap="space-300" className={x} />;'),
    ).toEqual([]);
  });
});

describe("raw strings", () => {
  test("reports JSX text with its position", () => {
    expect(messages("const a = (\n  <p>\n    Hello\n  </p>\n);")).toEqual([
      { line: 2, column: 6, kind: "text" },
    ]);
  });

  test.each([
    ["a string child", '<p>{"Hello"}</p>'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX source under test
    ["a template child", "<p>{`Hello ${name}`}</p>"],
    ["a conditional branch", '<p>{done ? t("done") : "Pending"}</p>'],
    ["a logical fallback", '<p>{name ?? "Anonymous"}</p>'],
    ["a fragment child", "<>Hello</>"],
    ["a cast", '<p>{"Hello" as string}</p>'],
    ["a label prop", '<TextField label="Name" />'],
    ["an aria-label prop in braces", '<Button aria-label={"Close"} />'],
    ["a placeholder template", "<SearchField placeholder={`Search`} />"],
    ["a children prop", '<Text children="Hello" />'],
    ["an alt prop", '<img alt="Logo" />'],
  ])("reports %s", (_, jsx) => {
    expect(messages(`const a = ${jsx};`)).toHaveLength(1);
  });

  test.each([
    ["catalog lookups", '<p title={t("a")}>{t("validation:home.title")}</p>'],
    ["whitespace text and spacers", '<p>\n  {t("a")}{" "}{t("b")}\n</p>'],
    [
      "non-text props",
      '<Button variant="primary" size="M" type="submit" href="/w" />',
    ],
    ["formatted values", "<p>{formatMoney(amount, currency)}</p>"],
    ["an empty template in a text prop", "<TextField label={``} />"],
  ])("allows %s", (_, jsx) => {
    expect(messages(`const a = ${jsx};`)).toEqual([]);
  });

  test("allows strings outside JSX", () => {
    expect(messages('const key = "validation:home.title";')).toEqual([]);
  });

  test("reports both branches of a conditional", () => {
    expect(messages('const a = <p>{ok ? "Yes" : "No"}</p>;')).toHaveLength(2);
  });
});

describe("the parts' text props", () => {
  const props = (code: string) =>
    checkSource(`const a = ${code};`, "screen.tsx").map(({ message }) =>
      message.replace(/^raw string in JSX prop (\S+):.*$/, "$1"),
    );

  // Any prop not named an identifier is text, so the parts' own text props are checked
  // without being listed.
  test.each([
    "primaryActionLabel",
    "secondaryActionLabel",
    "cancelLabel",
    "actionLabel",
    "heading",
    "unit",
    "caption",
    "detail",
    "header",
    "notice",
    "aside",
    "footer",
    "workspaceName",
    "before",
  ])("reports %s", (prop) => {
    expect(props(`<Part ${prop}="Words" />`)).toEqual([prop]);
    expect(props(`<Part ${prop}={"Words"} />`)).toEqual([prop]);
  });

  test("reports the ARIA attributes that hold text, and allows the others", () => {
    expect(
      props(
        '<Part aria-label="Close" aria-description="A" aria-valuetext="B" aria-roledescription="C" aria-placeholder="D" />',
      ),
    ).toEqual([
      "aria-label",
      "aria-description",
      "aria-valuetext",
      "aria-roledescription",
      "aria-placeholder",
    ]);
    expect(
      props(
        '<Part aria-labelledby="title hint" aria-haspopup="dialog" aria-current="page" aria-live="polite" />',
      ),
    ).toEqual([]);
  });

  test.each([
    [
      "an object's value, by its key",
      '<CardView addItem={{ label: "Add competitor", onAction }} />',
      "addItem.label",
    ],
    [
      "a column's name in an array",
      '<TableView columns={[{ id: "a", name: "Amount" }]} />',
      "columns.name",
    ],
    [
      "a detail's value",
      '<Card details={[{ id: "a", label: t("x"), value: "Fresh" }]} />',
      "details.value",
    ],
    ["an array of strings", '<Part items={["Apple", t("b")]} />', "items"],
    [
      "a render prop's result",
      '<ListView renderEmptyState={() => "No ideas yet."} />',
      "renderEmptyState",
    ],
    ["a joined string", '<Part heading={"Hello " + name} />', "heading"],
    [
      "an object spread into the props",
      '<Part {...{ label: "Spread" }} />',
      "label",
    ],
    [
      "a child render prop's result",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX source under test
      "<Part>{(item) => `Row ${item}`}</Part>",
      null,
    ],
  ])("reports %s", (_, jsx, prop) => {
    const findings = checkSource(`const a = ${jsx};`, "screen.tsx");
    expect(findings.map(({ message }) => message)).toEqual([
      prop === null
        ? "raw string in JSX: put UI text in the packages/i18n catalog (SDD 9章)"
        : `raw string in JSX prop ${prop}: put UI text in the packages/i18n catalog (SDD 9章)`,
    ]);
  });

  test.each([
    [
      "the parts' enum values",
      '<Text variant="body-sm" tone="secondary" size="S" density="compact" />',
    ],
    [
      "layout values",
      '<Flex gap="space-300" alignItems="center" justifyContent="space-between" width="full" />',
    ],
    [
      "keys, ids and paths",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX source under test
      '<Link key={`row-${id}`} id="export" href="/account" to="/w/$workspaceId" />',
    ],
    [
      "form fields' names and options' keys",
      '<TextField name="password" type="password" autoComplete="current-password" />',
    ],
    ["an option's value", '<Radio value="includeEmpty" />'],
    [
      "tokens separated by spaces",
      '<a rel="noopener noreferrer" className="a b" autoComplete="shipping street-address" data-state="open now" />',
    ],
    [
      "an identifier prop's object",
      '<Link search={{ filter: "unread" }} params={{ ideaId: "a1" }} />',
    ],
    [
      "identifier keys of a text prop's object",
      '<Pattern blocks={[{ id: "status", column: "main", content }]} />',
    ],
    [
      "arrays of keys",
      '<Menu disabledKeys={["delete", "rename"]} acceptedFileTypes={[".json", "application/json"]} />',
    ],
    [
      "calls and variables",
      '<Part heading={t("a")} unit={formatUnit(u)} caption={caption} detail={item.name} />',
    ],
    [
      "handlers",
      '<Button onPress={() => setMode("edit")} onChange={(v) => { save("x"); }} />',
    ],
    ["comparisons", '<Part isSelected={tab === "members"} />'],
  ])("allows %s", (_, jsx) => {
    expect(messages(`const a = ${jsx};`)).toEqual([]);
  });

  // `name` and `value` name a form field and an option on an element, and are shown by
  // others (Avatar, MetricTile): a literal that cannot be an identifier is text.
  test.each([
    ['<Avatar name="Ana Reyes" />', "name"],
    ['<MetricTile value="₱1,000" />', "value"],
    ['<Part id="Rent row" />', "id"],
    ['<Link href="Open the account" />', "href"],
  ])("reports text given to an identifier prop: %s", (jsx, prop) => {
    expect(props(jsx)).toEqual([prop]);
  });

  // The props the parts show although other components take them as keys (packages/ui-web's
  // prop types): a one-word literal there is text.
  test.each([
    ['<AlertBanner action="Reload" />', "action"],
    ['<PublicPattern action="Continue" />', "action"],
    ['<PublicSection layout="close" action="Log in" />', "action"],
    ['<MetricTile value="Empty" />', "value"],
    ['<MetricTile value="N/A" />', "value"],
    ['<IdeaPreview name="Untitled" value="₱1" />', "name"],
    ['<Avatar name="Ana" />', "name"],
    ['<CheckDots name="Price" state="done" />', "name"],
    ['<TextField name="title" value="Hello" />', "value"],
    ['<NumberField name="price" value="12" />', "value"],
    ['<SearchField name="q" value="bowl" />', "value"],
    ['<Avatar {...{ name: "Ana" }} />', "name"],
  ])("reports a one-word text: %s", (jsx, prop) => {
    expect(props(jsx).filter((found) => found === prop)).toEqual([prop]);
  });

  test.each([
    [
      "form fields' names",
      '<form.AppField name="email" /><TextArea name="note" /><DatePicker name="due" value="2026-10-16" />',
    ],
    [
      "choices' keys",
      '<Picker name="role" value="owner" defaultValue="member" /><ComboBox value="u1" /><RadioGroup name="scope" value="all" /><Radio value="none" /><CheckboxGroup value={["a", "b"]} /><Checkbox value="includeEmpty" /><Switch name="focus" value="on" />',
    ],
    [
      "a field's name spread into its props",
      '<TextField {...{ name: "password" }} />',
    ],
    [
      "an HTML element's identifiers",
      '<form action="/api/v1/session" method="post"><input name="q" value="bowl" type="search" /><label htmlFor="q" /></form>',
    ],
    [
      "an enum prop, which the part names from the catalog",
      '<FauButtons state="fact" unclassified="label" />',
    ],
  ])("allows %s", (_, jsx) => {
    expect(messages(`const a = <>${jsx}</>;`)).toEqual([]);
  });

  test("an HTML element's other attributes are text", () => {
    expect(
      props(
        '<><img alt="Logo" src="/logo.svg" /><abbr title="Philippine peso" /></>',
      ),
    ).toEqual(["alt", "title"]);
  });

  test("the finding points at the literal", () => {
    expect(
      checkSource(
        'const a = (\n  <Pattern\n    primaryActionLabel="Save"\n  />\n);',
        "screen.tsx",
      ).map(({ line, column }) => ({ line, column })),
    ).toEqual([{ line: 3, column: 24 }]);
  });
});

describe("the identifier props agree with the declarations", () => {
  // A prop is an identifier on every component only if no part or screen declares it as
  // something shown. Read every interface and type literal of packages/ui-web and
  // apps/web: their members are the props of the parts and the screens' components, and
  // the keys of the objects they take. A type is read as written: an alias defined
  // elsewhere (`Size`, `FauState`) counts as a set of values.
  const root = join(import.meta.dir, "..");
  const sources = ["packages/ui-web/src", "apps/web/src"].flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
      .filter(
        (path) =>
          /\.tsx?$/.test(path) &&
          !/\.(test|css)\.tsx?$|^preview\/|^test\/|routeTree\.gen\.ts$/.test(
            path,
          ),
      )
      .map((path) => join(dir, path)),
  );

  /** What a type lets a prop hold: `shown` (ReactNode), `string` (string, Key) or neither. */
  const holds = (type: Node | null | undefined): "shown" | "string" | null => {
    if (type == null) return null;
    switch (type.type) {
      case "TSStringKeyword":
        return "string";
      case "TSFunctionType":
      case "TSTypeLiteral":
        return null;
      case "TSTypeReference": {
        const name =
          type.typeName.type === "Identifier" ? type.typeName.name : null;
        if (name === "ReactNode" || name === "ReactElement") return "shown";
        if (name === "Key") return "string";
        return strongest(type.typeArguments?.params ?? []);
      }
      case "TSUnionType":
      case "TSIntersectionType":
        return strongest(type.types);
      case "TSArrayType":
        return holds(type.elementType);
      case "TSTypeOperator":
        return type.operator === "keyof" ? null : holds(type.typeAnnotation);
      case "TSParenthesizedType":
        return holds(type.typeAnnotation);
      case "TSTemplateLiteralType":
        return strongest(type.types);
      default:
        return null;
    }
  };
  const strongest = (types: readonly Node[]) => {
    const found = types.map(holds);
    return found.includes("shown")
      ? "shown"
      : found.includes("string")
        ? "string"
        : null;
  };

  const declarations = sources.flatMap((path) => {
    const code = readFileSync(join(root, path), "utf8");
    const ast = parse(code, {
      sourceType: "module",
      plugins: path.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"],
    });
    const found: { where: string; prop: string; holds: string | null }[] = [];
    const visit = (node: Node) => {
      if (
        node.type === "TSPropertySignature" &&
        node.key.type === "Identifier"
      ) {
        found.push({
          where: `${path}:${node.loc?.start.line}`,
          prop: node.key.name,
          holds: holds(node.typeAnnotation?.typeAnnotation),
        });
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === "loc" || key.endsWith("Comments")) continue;
        for (const child of Array.isArray(value) ? value : [value]) {
          if (typeof child?.type === "string") visit(child);
        }
      }
    };
    visit(ast.program);
    return found;
  });

  test("the sources are read", () => {
    expect(declarations.some(({ prop }) => prop === "variant")).toBe(true);
    expect(declarations.some(({ prop }) => prop === "saveScope")).toBe(true);
  });

  test("an enum prop is never declared as a string or as something shown", () => {
    expect(
      declarations.filter(
        ({ prop, holds }) => ENUM_PROPS.has(prop) && holds !== null,
      ),
    ).toEqual([]);
  });

  test("a key prop is never declared as something shown", () => {
    expect(
      declarations.filter(
        ({ prop, holds }) => KEY_PROPS.has(prop) && holds === "shown",
      ),
    ).toEqual([]);
  });

  test("the parts that take keys are packages/ui-web's", () => {
    const index = readFileSync(
      join(root, "packages/ui-web/src/index.ts"),
      "utf8",
    );
    const parts = [...PART_KEY_PROPS.keys()].filter(
      // TanStack Form's field, not a part.
      (part) => part !== "AppField",
    );
    expect(
      parts.filter((part) => !new RegExp(`\\b${part},`).test(index)),
    ).toEqual([]);
  });
});

describe("checkScreens", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "moonx-check-screens-"));
    mkdirSync(join(dir, "routes"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("checks nested TSX and JSX files and skips tests and plain TS", () => {
    writeFileSync(
      join(dir, "routes", "home.tsx"),
      "export const A = () => <p>Hello</p>;\n",
    );
    writeFileSync(
      join(dir, "legacy.jsx"),
      "export const B = () => <div style={{}} />;\n",
    );
    writeFileSync(
      join(dir, "routes", "home.test.tsx"),
      "render(<p>Fixture</p>);\n",
    );
    writeFileSync(join(dir, "copy.ts"), 'export const C = "Not JSX";\n');

    expect(checkScreens(dir, dir)).toEqual([
      {
        file: "legacy.jsx",
        line: 1,
        column: 29,
        message: expect.stringMatching(/^style/),
      },
      {
        file: "routes/home.tsx",
        line: 1,
        column: 27,
        message: expect.stringMatching(/^raw/),
      },
    ]);
  });

  test("the command fails on findings and passes on a clean tree", () => {
    const run = () =>
      Bun.spawnSync(["bun", join(import.meta.dir, "check-screens.ts"), dir], {
        stderr: "pipe",
      });
    writeFileSync(
      join(dir, "clean.tsx"),
      'export const A = () => <p>{t("a")}</p>;\n',
    );
    expect(run().exitCode).toBe(0);

    writeFileSync(
      join(dir, "dirty.tsx"),
      "export const B = () => <p>Hello</p>;\n",
    );
    const result = run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain(
      "dirty.tsx:1:27 raw string in JSX",
    );
  });
});
