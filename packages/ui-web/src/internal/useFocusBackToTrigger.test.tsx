import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { useFocusBackToTrigger } from "./useFocusBackToTrigger";

// The hook only reads the roles React Aria writes on a collection, so the grid is built
// here directly: a row with its cell, an input and a ⋯, as a table row with a field.
function buildGrid() {
  const grid = document.createElement("div");
  grid.setAttribute("role", "grid");
  const row = document.createElement("div");
  row.setAttribute("role", "row");
  const cell = document.createElement("div");
  cell.setAttribute("role", "gridcell");
  cell.tabIndex = -1;
  const input = document.createElement("input");
  const buttonCell = document.createElement("div");
  buttonCell.setAttribute("role", "gridcell");
  const button = document.createElement("button");
  buttonCell.append(button);
  const trigger = document.createElement("button");
  row.append(cell, input, buttonCell, trigger);
  grid.append(row);
  document.body.append(grid);
  return { grid, cell, input, button, trigger };
}

afterEach(() => {
  document.body.replaceChildren();
});

test("focus the grid puts on its own cell goes back to the trigger", () => {
  const { cell, trigger } = buildGrid();
  const { result } = renderHook(() =>
    useFocusBackToTrigger({ current: trigger }),
  );
  act(() => result.current());
  act(() => cell.focus());
  expect(document.activeElement).toBe(trigger);
});

test("focus the grid hands to another cell's button goes back to the trigger", () => {
  const { button, trigger } = buildGrid();
  const { result } = renderHook(() =>
    useFocusBackToTrigger({ current: trigger }),
  );
  act(() => result.current());
  act(() => button.focus());
  expect(document.activeElement).toBe(trigger);
});

test("an input an action focuses keeps the focus, and the wait ends", () => {
  const { cell, input, trigger } = buildGrid();
  const { result } = renderHook(() =>
    useFocusBackToTrigger({ current: trigger }),
  );
  act(() => result.current());
  act(() => input.focus());
  expect(document.activeElement).toBe(input);
  // The wait is over: the grid's cell later keeps its focus too.
  act(() => cell.focus());
  expect(document.activeElement).toBe(cell);
});

test("outside a collection there is nothing to wait for", () => {
  const trigger = document.createElement("button");
  const other = document.createElement("button");
  document.body.append(trigger, other);
  const { result } = renderHook(() =>
    useFocusBackToTrigger({ current: trigger }),
  );
  act(() => result.current());
  act(() => other.focus());
  expect(document.activeElement).toBe(other);
});
