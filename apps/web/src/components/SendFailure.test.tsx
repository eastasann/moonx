import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api";
import { AuthError } from "../lib/auth";
import { SendFailure } from "./SendFailure";

const alertText = () => screen.getByRole("alert").textContent;

describe("SendFailure: why a send failed (design-spec 6.0.6, SDD 8.2)", () => {
  test("the screen's words for a code it expects, without Retry", () => {
    render(
      <SendFailure
        error={
          new AuthError({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })
        }
        messages={{
          INVALID_EMAIL_OR_PASSWORD: "Email or password is incorrect",
        }}
        onRetry={() => {}}
      />,
    );
    expect(alertText()).toContain("Email or password is incorrect");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  test("a rate limit with its wait, rounded up to minutes", () => {
    render(
      <SendFailure
        error={
          new AuthError({
            status: 429,
            code: "RATE_LIMITED",
            retryAfterSeconds: 45,
          })
        }
        onRetry={() => {}}
      />,
    );
    expect(alertText()).toContain("Too many attempts. Try again in 1 minute.");
  });

  test("a rate limit of the API's paths reads its retryAfterSeconds", () => {
    render(
      <SendFailure
        error={
          new ApiError({
            status: 429,
            code: "RATE_LIMITED",
            requestId: null,
            detail: { retryAfterSeconds: 2700 },
          })
        }
        onRetry={() => {}}
      />,
    );
    expect(alertText()).toContain(
      "Too many attempts. Try again in 45 minutes.",
    );
  });

  test("a rate limit without a wait", () => {
    render(
      <SendFailure
        error={new AuthError({ status: 429, code: "RATE_LIMITED" })}
        onRetry={() => {}}
      />,
    );
    expect(alertText()).toContain("Too many attempts. Try again later.");
  });

  test("anything else: Something went wrong, its Ref, and Retry", async () => {
    const onRetry = vi.fn();
    render(
      <SendFailure
        error={
          new ApiError({
            status: 500,
            code: "INTERNAL",
            requestId: "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c",
          })
        }
        onRetry={onRetry}
      />,
    );
    expect(alertText()).toContain("Something went wrong");
    expect(alertText()).toContain("Ref: 8f14e45f");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  test("a save that the network failed: Couldn't save and Retry, no Ref", () => {
    render(
      <SendFailure
        error={new ApiError({ status: null, code: null, requestId: null })}
        transient="couldNotSave"
        onRetry={() => {}}
        isRetryDisabled
      />,
    );
    expect(alertText()).toContain("Couldn't save");
    expect(alertText()).not.toContain("Ref:");
    expect(
      screen.getByRole("button", { name: "Retry" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
