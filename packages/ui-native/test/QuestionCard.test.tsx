import { themes } from "@moonx/ui-tokens/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { QuestionCard, type QuestionCardProps } from "../src/components/QuestionCard";
import { QuestionFormPattern } from "../src/layout";

afterEach(resetMockUnistyles);

function Card(props: Partial<QuestionCardProps>) {
  return (
    <QuestionCard
      title="Behavior"
      prompt="What do customers do today?"
      isFocused={false}
      emptyLabel="Empty"
      status={<Text>Fact</Text>}
      meta={<Text>2 comments</Text>}
      actions={<Text>Comments button</Text>}
      {...props}
    >
      <Text>Answer field</Text>
      <Text>EXAMPLE</Text>
    </QuestionCard>
  );
}

test("unfocused: a pressable summary with title, status, meta and the answer, no body", () => {
  render(<Card answer="They buy at the market" />);
  const summary = screen.getByRole("button");
  expect(summary.props.style.minHeight).toBeGreaterThanOrEqual(44);
  expect(screen.getByText("Behavior")).toBeTruthy();
  expect(screen.getByText("Fact")).toBeTruthy();
  expect(screen.getByText("2 comments")).toBeTruthy();
  expect(screen.getByText("They buy at the market").props.numberOfLines).toBe(2);
  expect(screen.queryByText("Answer field")).toBeNull();
  expect(screen.queryByText("What do customers do today?")).toBeNull();
  expect(screen.queryByText("Comments button")).toBeNull();
});

test("an empty or blank answer shows the muted empty label", () => {
  const { rerender } = render(<Card />);
  const muted = screen.getByText("Empty").props.style.color;
  expect(muted).toBe(themes.light.color.text.placeholder);
  rerender(<Card answer="   " />);
  expect(screen.getByText("Empty")).toBeTruthy();
  rerender(<Card answer="Filled" />);
  expect(screen.getByText("Filled").props.style.color).toBe(themes.light.color.text.secondary);
});

test("pressing the summary asks for focus", () => {
  const onFocusRequest = jest.fn();
  render(<Card onFocusRequest={onFocusRequest} />);
  fireEvent.press(screen.getByRole("button"));
  expect(onFocusRequest).toHaveBeenCalledTimes(1);
});

test("focused: a named group with the prompt, header controls and the body children", () => {
  render(<Card isFocused answer="ignored" />);
  expect(screen.getByLabelText("Behavior").props.role).toBe("group");
  expect(screen.getByText("What do customers do today?")).toBeTruthy();
  expect(screen.getByText("Answer field")).toBeTruthy();
  expect(screen.getByText("EXAMPLE")).toBeTruthy();
  expect(screen.getByText("Comments button")).toBeTruthy();
  expect(screen.getByText("Fact")).toBeTruthy();
  expect(screen.queryByText("ignored")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

test("the title is drawn in upper case", () => {
  render(<Card />);
  expect(screen.getByText("Behavior").props.style.textTransform).toBe("uppercase");
});

test("inside a question form only the focused card shows while one is focused", () => {
  const { rerender } = render(
    <QuestionFormPattern>
      <Card title="One" />
      <Card title="Two" isFocused />
      <Card title="Three" />
    </QuestionFormPattern>,
  );
  expect(screen.getByLabelText("Two")).toBeTruthy();
  expect(screen.queryByText("One")).toBeNull();
  expect(screen.queryByText("Three")).toBeNull();
  rerender(
    <QuestionFormPattern>
      <Card title="One" />
      <Card title="Two" />
      <Card title="Three" />
    </QuestionFormPattern>,
  );
  expect(screen.getByText("One")).toBeTruthy();
  expect(screen.getByText("Two")).toBeTruthy();
  expect(screen.getByText("Three")).toBeTruthy();
});

test("pressing a summary moves focus to its card", () => {
  function Form() {
    const [focus, setFocus] = useState("");
    return (
      <QuestionFormPattern>
        {["one", "two"].map((id) => (
          <Card key={id} title={id} isFocused={focus === id} onFocusRequest={() => setFocus(id)} />
        ))}
      </QuestionFormPattern>
    );
  }
  render(<Form />);
  expect(screen.getAllByRole("button")).toHaveLength(2);
  fireEvent.press(screen.getAllByRole("button")[1] as never);
  expect(screen.getByLabelText("two")).toBeTruthy();
  expect(screen.queryByText("one")).toBeNull();
});

test("dark theme draws the focused card on the dark raised surface", () => {
  mockUnistyles({ theme: "dark" });
  render(<Card isFocused />);
  expect(screen.getByLabelText("Behavior").props.style.backgroundColor).toBe(
    themes.dark.color.surface.raised,
  );
});
