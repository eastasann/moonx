import { render, screen } from "@testing-library/react-native";
import Landing from "../app/index";

test("the landing route renders", () => {
  render(<Landing />);
  expect(screen.getByTestId("landing")).toBeTruthy();
});
