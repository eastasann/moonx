import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Well } from "../src/components/Well";

test("an unnamed well just holds its content", () => {
  render(<Well>Summary of the evidence</Well>);
  expect(screen.getByText("Summary of the evidence")).toBeTruthy();
  expect((screen.toJSON() as unknown as { props: { role?: string } }).props.role).toBeUndefined();
});

test("a named well is a labelled group", () => {
  render(
    <Well aria-label="Decision summary">
      <Text>Proceed</Text>
    </Well>,
  );
  expect(screen.getByLabelText("Decision summary").props.role).toBe("group");
});

test("preformatted shows the text in the monospace face inside a scroll view", () => {
  render(
    <Well aria-label="Export preview" preformatted>
      {"line one\n  line two"}
    </Well>,
  );
  const text = screen.getByText(/line one/);
  expect(text.props.children).toBe("line one\n  line two");
  expect(text.props.style.fontFamily).toBeTruthy();
  expect(text.props.selectable).toBe(true);
  expect(
    screen.UNSAFE_getByType(require("react-native").ScrollView).props.nestedScrollEnabled,
  ).toBe(true);
});

test("preformatted caps its height at the sheet ratio of the window", () => {
  render(
    <Well aria-label="Export preview" preformatted>
      text
    </Well>,
  );
  const { height } = require("react-native").Dimensions.get("window");
  const scroll = screen.UNSAFE_getByType(require("react-native").ScrollView);
  expect(scroll.props.style.maxHeight).toBeCloseTo(height * 0.85);
});
