import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Tag, TagGroup } from "../src/components/TagGroup";

/** Containers are not accessible elements (that would hide their children), so find them by role prop. */
const hostsWithRole = (role: string) =>
  screen.UNSAFE_root.findAll((node) => node.props.role === role && typeof node.type === "string");

afterEach(resetMockUnistyles);

test("renders a labelled list of tags with description", () => {
  render(
    <TagGroup label="Evidence" description="Pick what backs this up">
      <Tag id="a">Alpha</Tag>
      <Tag id="b">Beta</Tag>
    </TagGroup>,
  );
  expect(hostsWithRole("group")[0]?.props["aria-label"]).toBe("Evidence");
  expect(hostsWithRole("list")).toHaveLength(1);
  expect(hostsWithRole("listitem")).toHaveLength(2);
  expect(screen.getByText("Pick what backs this up")).toBeTruthy();
});

test("aria-label names a group that has no visible label", () => {
  render(
    <TagGroup aria-label="Filters">
      <Tag id="a">Alpha</Tag>
    </TagGroup>,
  );
  expect(hostsWithRole("group")[0]?.props["aria-label"]).toBe("Filters");
});

test("tags are not removable without onRemove", () => {
  render(
    <TagGroup aria-label="Filters">
      <Tag id="a">Alpha</Tag>
    </TagGroup>,
  );
  expect(screen.queryByRole("button")).toBeNull();
});

test("remove buttons are named with the tag text, report the id and are touch targets", () => {
  const onRemove = jest.fn();
  render(
    <TagGroup aria-label="Filters" onRemove={onRemove} removeLabel="Remove">
      <Tag id="a">Alpha</Tag>
      <Tag id="b" textValue="Beta tag">
        <>Beta</>
      </Tag>
    </TagGroup>,
  );
  const alpha = screen.getByRole("button", { name: "Remove Alpha" });
  expect(alpha.props.style.minHeight).toBeGreaterThanOrEqual(44);
  expect(alpha.props.style.minWidth).toBeGreaterThanOrEqual(44);
  fireEvent.press(alpha);
  expect(onRemove).toHaveBeenCalledWith(["a"]);
  fireEvent.press(screen.getByRole("button", { name: "Remove Beta tag" }));
  expect(onRemove).toHaveBeenLastCalledWith(["b"]);
});

test("a disabled tag cannot be removed", () => {
  const onRemove = jest.fn();
  render(
    <TagGroup aria-label="Filters" onRemove={onRemove} removeLabel="Remove">
      <Tag id="a" isDisabled>
        Alpha
      </Tag>
    </TagGroup>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Remove Alpha" }));
  expect(onRemove).not.toHaveBeenCalled();
});

test("the error message shows only while invalid and is announced", () => {
  const { rerender } = render(
    <TagGroup aria-label="Filters" errorMessage="Pick one">
      <Tag id="a">Alpha</Tag>
    </TagGroup>,
  );
  expect(screen.queryByText("Pick one")).toBeNull();
  rerender(
    <TagGroup aria-label="Filters" errorMessage="Pick one" isInvalid>
      <Tag id="a">Alpha</Tag>
    </TagGroup>,
  );
  expect(screen.getByText("Pick one").props.accessibilityLiveRegion).toBe("polite");
});

test.each(COMPONENT_SIZES)("size %s keeps tags at least the touch target high", (size) => {
  render(
    <TagGroup aria-label="Filters" size={size}>
      <Tag id="a">Alpha</Tag>
    </TagGroup>,
  );
  expect(hostsWithRole("listitem")[0]?.props.style.minHeight).toBeGreaterThanOrEqual(44);
});

test("tag colors follow the dark theme", () => {
  const { rerender } = render(
    <TagGroup aria-label="Filters">
      <Tag id="a">Alpha</Tag>
    </TagGroup>,
  );
  const light = hostsWithRole("listitem")[0]?.props.style.backgroundColor;
  mockUnistyles({ theme: "dark" });
  rerender(
    <TagGroup aria-label="Filters">
      <Tag id="a">Alpha</Tag>
    </TagGroup>,
  );
  expect(hostsWithRole("listitem")[0]?.props.style.backgroundColor).not.toBe(light);
});
