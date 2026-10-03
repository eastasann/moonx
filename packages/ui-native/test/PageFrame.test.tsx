import { render, screen } from "@testing-library/react-native";
import { Text as NativeText } from "react-native";
import { PageFrame } from "../src/components/PageFrame";

test("PageFrame is the main landmark around its children and fills the screen", () => {
  render(
    <PageFrame>
      <NativeText>content</NativeText>
    </PageFrame>,
  );
  // A bare View is not an accessible element, so `getByRole` cannot see the landmark.
  const main = screen.toJSON() as unknown as { props: { role: string; style: object } };
  expect(main.props.role).toBe("main");
  expect(main.props.style).toMatchObject({ flex: 1 });
  expect(screen.getByText("content")).toBeTruthy();
});
