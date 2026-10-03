import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { UnistylesRuntime } from "react-native-unistyles";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import * as ui from "../src";
import { UiProvider } from "../src";
import { ComponentGallery, GALLERY_COVERAGE } from "../src/preview";

afterEach(() => {
  resetMockUnistyles();
});

const SECTIONS = [
  "Actions",
  "Fields",
  "Overlays",
  "Status and feedback",
  "Collections and containers",
  "App frame and app-specific parts",
  "Layout",
];

/**
 * Exports that start with an uppercase letter but are not parts to look at. A provider mounts
 * context and draws nothing of its own; the gallery already runs inside one. Contexts are
 * objects, not functions, and hooks start with `use`, so the typeof / uppercase filter below
 * already leaves them out; only the provider needs naming.
 */
const NOT_A_PART = new Set(["UiProvider"]);

/** Renders, then lets the reduced-motion lookups that every animated part starts on mount settle. */
async function renderGallery() {
  render(
    <UiProvider>
      <ComponentGallery />
    </UiProvider>,
  );
  await act(async () => {});
}

/** Text of the headings at one outline level; testing-library's `level` option is not supported. */
const headingsAt = (level: number) =>
  screen
    .getAllByRole("heading")
    .filter((heading) => heading.props["aria-level"] === level)
    .map((heading) => String(heading.props.children));

const partsOfTheLibrary = Object.entries(ui)
  .filter(([name, value]) => typeof value === "function" && /^[A-Z]/.test(name))
  .map(([name]) => name)
  .filter((name) => !NOT_A_PART.has(name));

test("renders every section", async () => {
  await renderGallery();
  expect(screen.getByRole("heading", { name: "Component gallery" })).toBeTruthy();
  for (const name of SECTIONS) {
    expect(screen.getByRole("heading", { name })).toBeTruthy();
  }
});

test("the coverage list names every component the library exports", () => {
  expect(partsOfTheLibrary.length).toBeGreaterThan(60);
  const missing = partsOfTheLibrary.filter((name) => !GALLERY_COVERAGE.includes(name));
  expect(missing).toEqual([]);
});

test("the coverage list names nothing that the library does not export", () => {
  const unknown = GALLERY_COVERAGE.filter((name) => !partsOfTheLibrary.includes(name));
  expect(unknown).toEqual([]);
});

test("every name on the coverage list is on screen as a component title or an include", async () => {
  await renderGallery();
  const titles = headingsAt(3);
  const includes = screen
    .getAllByText(/^Includes: /)
    .flatMap((node) => String(node.props.children).replace("Includes: ", "").split(", "));
  const shown = (name: string) =>
    titles.some((title) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(title)) ||
    includes.includes(name);
  expect(GALLERY_COVERAGE.filter((name) => !shown(name))).toEqual([]);
});

test("shows the layout patterns A to J", async () => {
  await renderGallery();
  const titles = headingsAt(3);
  for (const letter of "ABCDEFGHIJ") {
    expect(titles.some((title) => title.startsWith(`${letter}. `))).toBe(true);
  }
});

test("the theme control flips the theme and the readout", async () => {
  await renderGallery();
  const control = screen.getByLabelText("Theme");
  const choose = async (name: string) => {
    await act(async () => {
      fireEvent.press(within(control).getByRole("radio", { name }));
    });
  };
  expect(UnistylesRuntime.themeName).toBe("light");
  expect(screen.getByText(/^Theme light, window \d+ px, \w+ layout$/)).toBeTruthy();

  await choose("Dark");
  expect(UnistylesRuntime.themeName).toBe("dark");
  expect(UnistylesRuntime.hasAdaptiveThemes).toBe(false);
  expect(screen.getByText(/^Theme dark, window/)).toBeTruthy();

  await choose("Light");
  expect(UnistylesRuntime.themeName).toBe("light");

  await choose("System");
  expect(UnistylesRuntime.hasAdaptiveThemes).toBe(true);
});

test("the readout follows the window width", async () => {
  await renderGallery();
  await act(async () => {
    mockUnistyles({ width: 900 });
  });
  expect(screen.getByText(/Tablet layout$/)).toBeTruthy();
});

test("every overlay has a trigger that opens it", async () => {
  await renderGallery();
  fireEvent.press(screen.getByRole("button", { name: "Open fullscreen" }));
  expect(screen.getByText("Body of the fullscreen dialog.")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Open tray" }));
  expect(screen.getByText("Tray content")).toBeTruthy();
});

test("the remove button on a gallery tag takes the tag out", async () => {
  await renderGallery();
  const before = screen.getAllByRole("button", { name: "Remove Market size" });
  fireEvent.press(before[0] as (typeof before)[number]);
  expect(screen.getAllByRole("button", { name: "Remove Market size" })).toHaveLength(
    before.length - 1,
  );
});

test("a toast button queues a toast in the region", async () => {
  await renderGallery();
  fireEvent.press(screen.getByRole("button", { name: "Show title only" }));
  expect(screen.getByText("Decision recorded")).toBeTruthy();
});
