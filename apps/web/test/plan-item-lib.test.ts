import { expect, test } from "vitest";
import { rowsBody, sameRows, type TableColumn } from "../src/lib/plan-item";

const columns: TableColumn[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "ownership", label: "Initial ownership (%)", type: "percent" },
];

test("a saved table row keeps the hidden value of a column the template no longer has", () => {
  const stored = [{ name: "Ana", ownership: 0.4, capital: 100000 }];
  expect(rowsBody(columns, stored)).toEqual([{ name: "Ana", ownership: 0.4, capital: 100000 }]);
});

test("blank text becomes null, missing columns are added, and the columns come first", () => {
  const body = rowsBody(columns, [{ legacy: "kept", name: "  " }]);
  expect(body).toEqual([{ name: null, ownership: null, legacy: "kept" }]);
  expect(Object.keys(body[0] as object)).toEqual(["name", "ownership", "legacy"]);
});

test("rows that differ only in a hidden value are not the same rows", () => {
  const a = [{ name: "Ana", ownership: 0.4, capital: 1 }];
  const b = [{ name: "Ana", ownership: 0.4, capital: 2 }];
  expect(sameRows(columns, a, a)).toBe(true);
  expect(sameRows(columns, a, b)).toBe(false);
});
