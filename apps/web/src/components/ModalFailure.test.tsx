import type { ErrorCode } from "@moonx/schemas";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api";
import { ModalSendFailure } from "./ModalFailure";

const failure = (status: number | null, code: ErrorCode | null) =>
  new ApiError({ status, code, requestId: "8f14e45f-0000" });

describe("ModalSendFailure: a modal's failed send (design-spec 6.0.6・6.0.2)", () => {
  test("the network: Couldn't save and Retry, in place", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ModalSendFailure
        error={failure(null, null)}
        onRetry={onRetry}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Couldn't save");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  test("a refusal for good: Couldn't save with 6.0.2's reason", () => {
    render(
      <ModalSendFailure
        error={failure(409, "ARCHIVED")}
        onRetry={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("It's archived");
  });

  test("anything else: the small dialog with its Ref, whose Close closes the modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ModalSendFailure
        error={failure(500, "INTERNAL")}
        onRetry={() => {}}
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole("alertdialog", {
      name: /Something went wrong/,
    });
    expect(dialog.textContent).toContain("Ref: 8f14e45f");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("a lost session: nothing here, M9 takes it", () => {
    const { container } = render(
      <ModalSendFailure
        error={failure(401, "UNAUTHENTICATED")}
        onRetry={() => {}}
        onClose={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
  });
});
