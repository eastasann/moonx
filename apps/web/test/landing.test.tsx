import { render, screen } from "@testing-library/react";
import { Route } from "../src/routes/index";

test("the landing route renders", () => {
  const Component = Route.options.component as () => React.JSX.Element;
  render(<Component />);
  expect(screen.getByTestId("landing")).toBeTruthy();
});
