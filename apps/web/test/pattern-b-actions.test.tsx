import { screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderApp, stubApi, unauthenticated } from "./support";
import { api as aiApi, exportPath, importPath, registerAiHooks, VALIDATION } from "./support-ai";
import { openDecide } from "./support-decision";

registerAiHooks();

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The container the layout pattern pins to the bottom of the phone screen (design-spec 4.1). */
const pinnedAction = (name: string) =>
  screen.getByRole("button", { name }).closest("[data-tab-bar]");

const signedOut = { "GET /api/v1/me": unauthenticated };

test("Log in is pinned to the bottom, with no tab bar below it", async () => {
  stubApi(signedOut);
  await renderApp("/login");
  await screen.findByRole("heading", { level: 1, name: "Log in" });
  expect(pinnedAction("Log in")).toHaveAttribute("data-tab-bar", "false");
});

test("Send reset link is pinned to the bottom", async () => {
  stubApi(signedOut);
  await renderApp("/forgot-password");
  await screen.findByRole("heading", { level: 1 });
  expect(pinnedAction("Send reset link")).toHaveAttribute("data-tab-bar", "false");
});

test("the reset password button is pinned to the bottom", async () => {
  stubApi(signedOut);
  await renderApp("/reset-password?token=abc");
  await screen.findByRole("heading", { level: 1 });
  expect(pinnedAction("Save password")).toHaveAttribute("data-tab-bar", "false");
});

test("the sign-up button of an invitation is pinned to the bottom", async () => {
  stubApi({
    ...signedOut,
    "GET /api/v1/invitations/by-token/abc": () => ({
      body: {
        status: "pending",
        email: "ana@example.com",
        workspace: null,
        role: null,
        invitedBy: null,
        expiresAt: new Date().toISOString(),
        accountExists: false,
      },
    }),
  });
  await renderApp("/invite/abc");
  await screen.findByRole("textbox", { name: /Display name/ });
  expect(pinnedAction("Create account")).toHaveAttribute("data-tab-bar", "false");
});

test("Record decision is pinned to the bottom above the tab bar", async () => {
  await openDecide();
  expect(pinnedAction("Record decision")).toHaveAttribute("data-tab-bar", "true");
});

test("the AI export and import wizards pin their step actions above the tab bar", async () => {
  aiApi();
  await renderApp(exportPath(`source=validation&id=${VALIDATION}`));
  await screen.findByRole("heading", { level: 1, name: "Export for AI" });
  expect(pinnedAction("Next")).toHaveAttribute("data-tab-bar", "true");
});

test("the AI import wizard pins Next above the tab bar", async () => {
  aiApi();
  await renderApp(importPath(`target=validation&id=${VALIDATION}`));
  await screen.findByRole("heading", { level: 1 });
  expect(pinnedAction("Next")).toHaveAttribute("data-tab-bar", "true");
});
