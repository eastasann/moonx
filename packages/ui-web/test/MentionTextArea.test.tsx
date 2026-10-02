import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { applyMention, findMentionQuery, MentionTextArea } from "../src/components/MentionTextArea";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";

const CANDIDATES = [
  { id: "ana", name: "Ana Reyes" },
  { id: "ben", name: "Ben Cruz" },
  { id: "anabel", name: "Anabel Lim" },
];

function Harness({ onMention }: { onMention: (id: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <MentionTextArea
      label="Comment"
      value={value}
      onChange={setValue}
      candidates={CANDIDATES}
      onMention={onMention}
      listLabel="Members"
    />
  );
}

test("findMentionQuery reads the word after an @ that ends at the caret", () => {
  expect(findMentionQuery("hi @an", 6)).toBe("an");
  expect(findMentionQuery("@", 1)).toBe("");
  expect(findMentionQuery("hi @an there", 6)).toBe("an");
  expect(findMentionQuery("hi @an there", 12)).toBeNull();
  expect(findMentionQuery("mail me@an", 10)).toBeNull();
});

test("applyMention swaps the typed query for @Name and a space", () => {
  expect(applyMention("hi @an there", 6, "Ana Reyes")).toEqual({
    text: "hi @Ana Reyes  there",
    caret: 14,
  });
});

test("typing @ and letters lists the matching members and Enter inserts one", async () => {
  const user = userEvent.setup();
  const onMention = vi.fn();
  render(<Harness onMention={onMention} />);
  const input = screen.getByRole("textbox", { name: "Comment" });
  expect(input).not.toHaveAttribute("aria-controls");
  await user.type(input, "Hello @an");
  expect(input).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
  const options = screen.getAllByRole("option");
  expect(options.map((o) => o.textContent)).toEqual(["Ana Reyes", "Anabel Lim"]);
  expect(screen.getByRole("listbox", { name: "Members" })).toBeInTheDocument();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(input).toHaveValue("Hello @Anabel Lim ");
  expect(onMention).toHaveBeenCalledWith("anabel");
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("Escape closes the list and a click on an option chooses it", async () => {
  const user = userEvent.setup();
  const onMention = vi.fn();
  render(<Harness onMention={onMention} />);
  const input = screen.getByRole("textbox", { name: "Comment" });
  await user.type(input, "@b");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull();
  await user.type(input, "e");
  await user.click(screen.getByRole("option", { name: "Ben Cruz" }));
  expect(input).toHaveValue("@Ben Cruz ");
  expect(onMention).toHaveBeenCalledWith("ben");
});

test("has no axe violations with the list open", async () => {
  const user = userEvent.setup();
  const { container } = render(<Harness onMention={() => {}} />);
  await user.type(screen.getByRole("textbox", { name: "Comment" }), "@");
  await expectNoAxeViolations(container);
});

test("below tablet typing @ opens a tray to search and choose the member", async () => {
  mockNarrow(true);
  const user = userEvent.setup();
  const onMention = vi.fn();
  render(<Harness onMention={onMention} />);
  const input = screen.getByRole("textbox", { name: "Comment" });
  await user.type(input, "Hello @");
  const tray = await screen.findByRole("dialog", { name: "Members" });
  expect(input).not.toHaveAttribute("aria-controls");
  expect(within(tray).getAllByRole("option")).toHaveLength(3);
  await user.type(within(tray).getByRole("textbox", { name: "Members" }), "an");
  expect(
    within(tray)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["Ana Reyes", "Anabel Lim"]);
  await user.click(within(tray).getByRole("option", { name: "Anabel Lim" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(input).toHaveValue("Hello @Anabel Lim ");
  expect(onMention).toHaveBeenCalledWith("anabel");
});

test("below tablet closing the tray keeps the typed text and does not reopen until the next keystroke", async () => {
  mockNarrow(true);
  const user = userEvent.setup();
  render(<Harness onMention={() => {}} />);
  const input = screen.getByRole("textbox", { name: "Comment" });
  await user.type(input, "@");
  await screen.findByRole("dialog", { name: "Members" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(input).toHaveValue("@");
});
