import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../src/components/Button";
import { Form } from "../src/components/Form";
import { TextField } from "../src/components/TextField";
import { expectNoAxeViolations } from "./axe";

test("submits without browser validation, even with an empty required field", async () => {
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <Form aria-label="Profile" onSubmit={onSubmit}>
      <TextField label="Display name" isRequired />
      <Button type="submit">Save</Button>
    </Form>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("form", { name: "Profile" })).toBeInTheDocument();
});

test("has no axe violations", async () => {
  const { container } = render(
    <Form aria-label="Profile" onSubmit={() => {}}>
      <TextField label="Display name" />
    </Form>,
  );
  await expectNoAxeViolations(container);
});
