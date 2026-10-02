import { expect, test } from "bun:test";
import { checkSource } from "./check-screens";

test("flags raw text, style attributes and raw label strings", () => {
  const found = checkSource(
    "a.tsx",
    `export const A = () => <div style={{ gap: 4 }} title="Save">Hello<span aria-label="Close" /></div>;`,
  );
  expect(found.map((f) => f.message.split(";")[0])).toEqual([
    "style attribute in a screen",
    "raw string in the title attribute",
    "raw text in JSX",
    "raw string in the aria-label attribute",
  ]);
});

test("accepts catalog lookups, whitespace and non-text attributes", () => {
  const found = checkSource(
    "b.tsx",
    `export const B = () => (
      <main data-testid="landing">
        {t("landing.title")}
        <img alt="" src="/x.png" />
      </main>
    );`,
  );
  expect(found).toEqual([]);
});

test("flags a string literal written as a JSX child expression", () => {
  const found = checkSource("c.tsx", `export const C = () => <p>{"Hello"}</p>;`);
  expect(found).toHaveLength(1);
});

test("covers native label props, expression attributes and ignores entities", () => {
  expect(
    checkSource(
      "d.tsx",
      `export const D = () => <T accessibilityLabel="Close" placeholder={"Name"} />;`,
    ),
  ).toHaveLength(2);
  expect(checkSource("e.tsx", `export const E = () => <p>&nbsp;&copy;</p>;`)).toEqual([]);
});
