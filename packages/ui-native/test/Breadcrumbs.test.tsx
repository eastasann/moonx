import { render, screen } from "@testing-library/react-native";
import { Breadcrumb, Breadcrumbs } from "../src/components/Breadcrumbs";

test("renders nothing on the phone: the screen shows a back arrow instead", () => {
  const { toJSON } = render(
    <Breadcrumbs aria-label="Breadcrumbs">
      <Breadcrumb href="/ideas" id="ideas">
        Ideas
      </Breadcrumb>
      <Breadcrumb>Piaya Gift Box</Breadcrumb>
    </Breadcrumbs>,
  );
  expect(toJSON()).toBeNull();
  expect(screen.queryByText("Ideas")).toBeNull();
  expect(screen.queryByLabelText("Breadcrumbs")).toBeNull();
});

test("a Breadcrumb on its own renders nothing", () => {
  const { toJSON } = render(<Breadcrumb>Ideas</Breadcrumb>);
  expect(toJSON()).toBeNull();
});
