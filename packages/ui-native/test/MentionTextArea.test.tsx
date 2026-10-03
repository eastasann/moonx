import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { TextInput } from "react-native";
import type { ReactTestInstance } from "react-test-renderer";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import {
  applyMention,
  findMentionQuery,
  type MentionCandidate,
  MentionTextArea,
} from "../src/components/MentionTextArea";
import { styleOf } from "./fieldHelpers";

afterEach(resetMockUnistyles);

const members: MentionCandidate[] = [
  { id: "ana", name: "Ana Reyes" },
  { id: "ben", name: "Ben Cruz" },
  { id: "ana2", name: "Anabel Lim" },
];

function Comment({
  initial = "",
  onMention,
  onChange,
  size,
}: {
  initial?: string;
  onMention?: (id: string) => void;
  onChange?: (value: string) => void;
  size?: "S" | "M" | "L" | "XL";
}) {
  const [value, setValue] = useState(initial);
  return (
    <MentionTextArea
      label="Comment"
      listLabel="Members"
      value={value}
      size={size}
      placeholder="Write a comment"
      candidates={members}
      onMention={onMention ?? (() => {})}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const body = () => screen.getByLabelText("Comment");
const inputs = () => screen.UNSAFE_getAllByType(TextInput);
const type = (text: string) => fireEvent.changeText(body(), text);

describe("findMentionQuery and applyMention", () => {
  test("find the text after an @ that ends at the caret", () => {
    expect(findMentionQuery("hi @an", 6)).toBe("an");
    expect(findMentionQuery("@", 1)).toBe("");
    expect(findMentionQuery("a@b", 3)).toBeNull();
    expect(findMentionQuery("hi @an there", 12)).toBeNull();
    expect(findMentionQuery("hi @an there", 6)).toBe("an");
  });

  test("insert the name and move the caret after it", () => {
    expect(applyMention("hi @an there", 6, "Ana Reyes")).toEqual({
      text: "hi @Ana Reyes  there",
      caret: 14,
    });
  });
});

test("renders a multiline input named by its label with the placeholder", () => {
  render(<Comment />);
  expect(body().props.multiline).toBe(true);
  expect(body().props.placeholder).toBe("Write a comment");
  expect(styleOf(body(), "minHeight").minHeight).toBeGreaterThanOrEqual(44);
  expect(screen.queryByRole("option")).toBeNull();
});

test.each(["S", "M", "L", "XL"] as const)("the frame is at least 44 high at size %s", (size) => {
  render(<Comment size={size} />);
  expect(styleOf(body(), "minHeight").minHeight).toBeGreaterThanOrEqual(44);
});

test("typing text without an @ opens nothing", () => {
  render(<Comment />);
  type("Hello there");
  expect(screen.queryByRole("option")).toBeNull();
  expect(inputs()).toHaveLength(1);
});

test("typing @ and letters opens a tray whose input starts with those letters", () => {
  render(<Comment />);
  type("Hi @an");
  expect(inputs()).toHaveLength(2);
  expect(inputs()[1]?.props.value).toBe("an");
  expect(screen.getAllByRole("option").map((o) => o.props.accessibilityLabel)).toEqual([
    "Ana Reyes",
    "Anabel Lim",
  ]);
  for (const option of screen.getAllByRole("option")) {
    expect(styleOf(option, "minHeight").minHeight).toBeGreaterThanOrEqual(44);
  }
});

test("a bare @ lists everyone and the tray's input filters further", () => {
  render(<Comment />);
  type("@");
  expect(screen.getAllByRole("option")).toHaveLength(3);
  fireEvent.changeText(inputs()[1] as ReactTestInstance, "ben");
  expect(screen.getAllByRole("option")).toHaveLength(1);
});

test("no tray opens when nothing matches the letters after the @", () => {
  render(<Comment />);
  type("@zzz");
  expect(inputs()).toHaveLength(1);
});

test("picking inserts @name into the body, reports the id and closes the tray", () => {
  const onMention = jest.fn();
  const onChange = jest.fn();
  render(<Comment onMention={onMention} onChange={onChange} />);
  type("Hi @an");
  fireEvent.press(screen.getByRole("option", { name: "Anabel Lim" }));
  expect(onChange).toHaveBeenLastCalledWith("Hi @Anabel Lim ");
  expect(onMention).toHaveBeenCalledWith("ana2");
  expect(body().props.value).toBe("Hi @Anabel Lim ");
  expect(screen.queryByRole("option")).toBeNull();
  expect(body().props.selection).toEqual({ start: 15, end: 15 });
});

test("the caret returned by the platform ends the forced selection", () => {
  render(<Comment />);
  type("@a");
  fireEvent.press(screen.getAllByRole("option")[0] as never);
  fireEvent(body(), "selectionChange", { nativeEvent: { selection: { start: 11, end: 11 } } });
  expect(body().props.selection).toBeUndefined();
});

test("the caret decides which @ is being typed", () => {
  render(<Comment initial="Hi @ana and Ben" />);
  fireEvent(body(), "selectionChange", { nativeEvent: { selection: { start: 6, end: 6 } } });
  expect(inputs()).toHaveLength(2);
  expect(inputs()[1]?.props.value).toBe("an");
  fireEvent(body(), "selectionChange", { nativeEvent: { selection: { start: 15, end: 15 } } });
  expect(inputs()).toHaveLength(1);
});

test("dismissing the tray keeps the text and stays closed until the next keystroke", () => {
  render(<Comment />);
  type("@an");
  act(() => screen.UNSAFE_getByType(BottomSheetModal).instance.dismiss());
  expect(screen.queryByRole("option")).toBeNull();
  expect(body().props.value).toBe("@an");
  type("@ana");
  expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
});

test("dark theme renders", () => {
  mockUnistyles({ theme: "dark" });
  render(<Comment />);
  type("@b");
  expect(screen.getByRole("option", { name: "Ben Cruz" })).toBeTruthy();
});
