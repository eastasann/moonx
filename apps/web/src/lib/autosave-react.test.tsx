import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { createAutosave } from "./autosave";
import { AutosaveProvider } from "./autosave-react";

// ADR-021「離脱の確認」: the browser asks before the page goes while input is unsaved.

const leave = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

test("closing or reloading the page asks while input is unsaved, and only then", () => {
  const autosave = createAutosave();
  render(
    <AutosaveProvider autosave={autosave}>
      <span />
    </AutosaveProvider>,
  );
  expect(leave()).toBe(false);
  autosave.change(
    {
      key: "idea:a",
      noun: "summary",
      send: () => new Promise(() => {}),
      loadTheirs: () => {},
    },
    1,
    { name: "Unsaved" },
  );
  expect(leave()).toBe(true);
  autosave.discardAll();
  expect(leave()).toBe(false);
});
