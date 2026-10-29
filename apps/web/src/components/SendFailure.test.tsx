import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api";
import { AuthError } from "../lib/auth";
import * as sentry from "../lib/sentry";
import { SendFailure } from "./SendFailure";

afterEach(() => {
  vi.restoreAllMocks();
});

const requestId = "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c";

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
    expect(
      within(screen.getByRole("alert")).getByText("Ref: 8f14e45f"),
    ).toBeTruthy();
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

  test("a save refused for good, with withSaveReasons: Couldn't save and 6.0.2's reason", () => {
    render(
      <SendFailure
        error={
          new ApiError({
            status: 409,
            code: "ARCHIVED",
            requestId: "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c",
          })
        }
        transient="couldNotSave"
        withSaveReasons
        onRetry={() => {}}
      />,
    );
    expect(alertText()).toContain("Couldn't save");
    expect(alertText()).toContain("It's archived");
    expect(alertText()).not.toContain("Ref:");
  });

  test("a lost session shows nothing: no Something went wrong, no Ref (M9 or 2 takes it)", () => {
    const report = vi.spyOn(sentry, "reportError");
    const { container } = render(
      <SendFailure
        error={
          new ApiError({ status: 401, code: "UNAUTHENTICATED", requestId })
        }
        transient="couldNotSave"
        withSaveReasons
        onRetry={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
    expect(report).not.toHaveBeenCalled();
  });

  test("an API 4xx shown as unexpected goes to Sentry once, tagged with its request id (SDD 8.2・11章)", () => {
    const report = vi.spyOn(sentry, "reportError").mockReturnValue("event");
    const error = new ApiError({ status: 409, code: "BUSY", requestId });
    const { rerender } = render(
      <SendFailure error={error} onRetry={() => {}} />,
    );
    rerender(<SendFailure error={error} onRetry={() => {}} />);
    expect(alertText()).toContain("Something went wrong");
    expect(
      within(screen.getByRole("alert")).getByText("Ref: 8f14e45f"),
    ).toBeTruthy();
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(error, { requestId });
  });

  test("not sent: a 500 (the API sends it), the network, a rate limit, a refusal with its reason, a code with words", () => {
    const report = vi.spyOn(sentry, "reportError");
    const cases = [
      new ApiError({ status: 500, code: "INTERNAL", requestId }),
      new ApiError({ status: null, code: null, requestId: null }),
      new ApiError({ status: 429, code: "RATE_LIMITED", requestId }),
      new ApiError({ status: 403, code: "FORBIDDEN", requestId }),
      new ApiError({ status: 404, code: "NOT_FOUND", requestId }),
      new ApiError({ status: 409, code: "NAME_TAKEN", requestId }),
    ];
    for (const error of cases) {
      render(
        <SendFailure
          error={error}
          messages={{ NAME_TAKEN: "This name is already used" }}
          transient="couldNotSave"
          withSaveReasons
          onRetry={() => {}}
        />,
      ).unmount();
    }
    expect(report).not.toHaveBeenCalled();
  });
});
