import type { Member } from "@moonx/schemas";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { CommentForm } from "../src/components/CommentForm";
import { i18n } from "../src/lib/i18n";

const member = (id: string, displayName: string): Member =>
  ({
    user: { id, displayName, avatarUrl: null, badge: null },
    role: "member",
  }) as Member;

test("choosing a member after @ writes @Name into the text and sends the id", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <I18nextProvider i18n={i18n}>
      <CommentForm
        label="Add a comment"
        submitLabel="Post"
        candidates={[member("p1", "Paolo Reyes"), member("a1", "Ana Villanueva")]}
        isSelfAnalysis={false}
        onSubmit={onSubmit}
      />
    </I18nextProvider>,
  );
  const input = screen.getByRole("textbox", { name: "Add a comment" });
  await userEvent.type(input, "Ask @pao");
  expect(screen.getByRole("listbox", { name: "Members to mention" })).toBeInTheDocument();
  await userEvent.keyboard("{Enter}");
  expect(input).toHaveValue("Ask @Paolo Reyes ");
  await userEvent.type(input, "about rent");
  await userEvent.click(screen.getByRole("button", { name: "Post" }));
  expect(onSubmit).toHaveBeenCalledWith("Ask @Paolo Reyes about rent", ["p1"]);
});
