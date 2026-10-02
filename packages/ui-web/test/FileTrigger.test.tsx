import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../src/components/Button";
import { FileTrigger } from "../src/components/FileTrigger";
import { expectNoAxeViolations } from "./axe";

test("reports the chosen files", async () => {
  const onSelect = vi.fn();
  const { container } = render(
    <FileTrigger acceptedFileTypes={["image/png"]} onSelect={onSelect}>
      <Button>Choose photo</Button>
    </FileTrigger>,
  );
  const input = container.querySelector("input[type=file]") as HTMLInputElement;
  expect(input).toHaveAttribute("accept", "image/png");
  const file = new File(["x"], "me.png", { type: "image/png" });
  await userEvent.upload(input, file);
  expect(onSelect).toHaveBeenCalledWith([file]);
  expect(screen.getByRole("button", { name: "Choose photo" })).toBeInTheDocument();
});

test("has no axe violations", async () => {
  const { container } = render(
    <FileTrigger onSelect={() => {}}>
      <Button>Choose photo</Button>
    </FileTrigger>,
  );
  await expectNoAxeViolations(container);
});
