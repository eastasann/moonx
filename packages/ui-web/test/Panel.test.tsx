import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Panel } from "../src/components/Panel";
import { expectNoAxeViolations } from "./axe";
import { mockMatchMedia } from "./matchMedia";
import { expectPressedClearsOnLeave } from "./pressed";

/** Pretends the viewport is `width` px wide for the min-width queries the panel reads. */
function setWidth(width: number) {
  mockMatchMedia((query) => {
    const min = /min-width: (\d+)px/.exec(query);
    return min ? width >= Number(min[1]) : false;
  });
}

function Harness({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <main>
        <button type="button" onClick={() => setOpen(true)}>
          Open comments
        </button>
        <textarea aria-label="Answer" />
      </main>
      <Panel
        isOpen={open}
        onOpenChange={setOpen}
        title="Comments"
        closeLabel="Close comments"
        footer={<input aria-label="New comment" />}
      >
        <p>No comments yet</p>
      </Panel>
    </>
  );
}

describe("Panel", () => {
  test("desktop: a side complementary region that leaves the page usable", async () => {
    setWidth(1280);
    render(<Harness />);
    const panel = screen.getByRole("complementary", { name: "Comments" });
    expect(panel).toHaveTextContent("No comments yet");
    expect(screen.getByRole("textbox", { name: "New comment" })).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Answer" }), "abc");
    expect(screen.getByRole("textbox", { name: "Answer" })).toHaveValue("abc");
  });

  test("desktop: the close button and Escape close it, and it renders nothing when closed", async () => {
    setWidth(1280);
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Close comments" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open comments" }));
    await userEvent.click(screen.getByRole("textbox", { name: "New comment" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  test.each([
    ["tablet", 900],
    ["phone", 400],
  ])("%s: a modal dialog with the title, closed by the button and Escape", async (_name, width) => {
    setWidth(width);
    render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "Comments" });
    expect(dialog).toHaveTextContent("No comments yet");
    await userEvent.click(screen.getByRole("button", { name: "Close comments" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open comments" }));
    expect(screen.getByRole("dialog", { name: "Comments" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("the close button shows hover and keyboard focus through data attributes", async () => {
    setWidth(1280);
    render(<Harness />);
    const closeButton = screen.getByRole("button", { name: "Close comments" });
    await userEvent.hover(closeButton);
    expect(closeButton).toHaveAttribute("data-hovered");
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(closeButton).toHaveAttribute("data-focus-visible");
  });

  // Why: releasing a press on the close button closes the panel and unmounts the button, so the
  // release cannot show the attribute going away. The pointer leaves with the button held instead,
  // which clears it on a node that is still mounted; the key check stops at the held key.
  test.each([1280, 900, 400])(
    "the close button is pressed while held and clears when the pointer leaves at %ipx",
    async (width) => {
      setWidth(width);
      const user = userEvent.setup();
      render(<Harness />);
      const closeButton = screen.getByRole("button", { name: "Close comments" });
      await expectPressedClearsOnLeave(closeButton, user);
      expect(screen.getByText("No comments yet")).toBeInTheDocument();
      closeButton.focus();
      await user.keyboard("{Enter>}");
      expect(closeButton).toHaveAttribute("data-pressed");
    },
  );

  test("a pointer click on the close button does not show data-focus-visible", async () => {
    setWidth(1280);
    const user = userEvent.setup();
    render(<Harness />);
    const closeButton = screen.getByRole("button", { name: "Close comments" });
    await user.pointer({ keys: "[MouseLeft>]", target: closeButton });
    expect(closeButton).not.toHaveAttribute("data-focus-visible");
    await user.pointer({ keys: "[/MouseLeft]" });
  });

  test.each([1280, 900, 400])("has no axe violations at %ipx", async (width) => {
    setWidth(width);
    const { baseElement } = render(<Harness />);
    await expectNoAxeViolations(baseElement);
  });
});
