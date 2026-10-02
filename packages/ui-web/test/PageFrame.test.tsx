import { render, screen } from "@testing-library/react";
import { PageFrame } from "../src/components/PageFrame";
import { expectNoAxeViolations } from "./axe";

test("is the main landmark of the page", () => {
  render(
    <PageFrame>
      <h1>Log in</h1>
    </PageFrame>,
  );
  expect(screen.getByRole("main")).toContainElement(
    screen.getByRole("heading", { name: "Log in" }),
  );
});

test("embedded, it is not a landmark", () => {
  render(
    <PageFrame isEmbedded>
      <p>Inside a page</p>
    </PageFrame>,
  );
  expect(screen.queryByRole("main")).toBeNull();
});

test("has no axe violations", async () => {
  const { container } = render(
    <PageFrame>
      <h1>Log in</h1>
    </PageFrame>,
  );
  await expectNoAxeViolations(container);
});
