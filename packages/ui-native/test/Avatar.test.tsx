import { AVATAR_SIZES } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Avatar, initialsOf } from "../src/components/Avatar";

const hidden = { includeHiddenElements: true };

test.each([
  ["Maria Santos", "MS"],
  ["maria", "M"],
  ["  Juan  dela Cruz ", "JD"],
  ["山田 太郎", "山太"],
  ["", ""],
])("initialsOf(%j) is %j", (name, initials) => {
  expect(initialsOf(name)).toBe(initials);
});

test("is one image named by the full name, showing initials", () => {
  render(<Avatar name="Maria Santos" />);
  expect(screen.getByRole("img", { name: "Maria Santos" })).toBeTruthy();
  expect(screen.getByText("MS", { includeHiddenElements: true })).toBeTruthy();
});

test.each(AVATAR_SIZES)("size %s follows the avatar token", (size) => {
  render(<Avatar name="Maria Santos" size={size} />);
  const style = screen.getByRole("img").props.style;
  expect(style.width).toBe(themes.light.scale.component.avatar.size[size]);
  expect(style.height).toBe(style.width);
});

test("without src there is no photo", () => {
  render(<Avatar name="Maria Santos" src={null} />);
  expect(screen.queryByTestId("avatar-photo", hidden)).toBeNull();
  render(<Avatar name="Maria Santos" src="" />);
  expect(screen.queryByTestId("avatar-photo", hidden)).toBeNull();
});

test("the photo is drawn over the initials and dropped when it cannot load", () => {
  render(<Avatar name="Maria Santos" src="https://example.com/maria.png" />);
  const photo = screen.getByTestId("avatar-photo", hidden);
  expect(photo.props.source).toEqual({ uri: "https://example.com/maria.png" });
  fireEvent(photo, "error");
  expect(screen.queryByTestId("avatar-photo", hidden)).toBeNull();
  expect(screen.getByText("MS", { includeHiddenElements: true })).toBeTruthy();
});
