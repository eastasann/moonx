import type { Me, Role } from "@moonx/schemas";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { WorkspaceContext } from "../components/workspace";
import { GettingStarted } from "./Dashboard";

const workspace = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "BCDX",
  isPersonal: false,
  currency: "PHP",
};

const me: Me = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  email: "ana@bcdx.example",
  displayName: "Ana Villanueva",
  avatarUrl: null,
  timezone: "Asia/Manila",
  theme: "system",
  isAdmin: false,
  hasPassword: true,
  lastWorkspaceId: workspace.id,
  memberships: [{ workspace, role: "owner" }],
};

const renderAs = (role: Role, onFirstIdea = () => {}) =>
  render(
    <WorkspaceContext.Provider value={{ me, workspace, role }}>
      <GettingStarted onFirstIdea={onFirstIdea} />
    </WorkspaceContext.Provider>,
  );

const steps = () =>
  within(screen.getByRole("list", { name: "Getting started" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

describe("Getting started (design-spec 6.9)", () => {
  test("an Owner: the self analysis, inviting the team, the first idea", () => {
    renderAs("owner");
    expect(
      screen.getByRole("heading", { level: 2, name: "Getting started" }),
    ).toBeTruthy();
    expect(steps()).toEqual([
      "Start your self analysis",
      "Invite your team",
      "Write your first idea",
    ]);
  });

  test("inviting the team opens 9", () => {
    renderAs("owner");
    expect(
      screen
        .getByRole("link", { name: "Invite your team" })
        .getAttribute("href"),
    ).toBe(`/w/${workspace.id}/settings`);
  });

  test("the first idea opens M1", async () => {
    const onFirstIdea = vi.fn();
    renderAs("member", onFirstIdea);
    await userEvent.click(screen.getByText("Write your first idea"));
    expect(onFirstIdea).toHaveBeenCalledOnce();
  });

  test("a Member does not invite", () => {
    renderAs("member");
    expect(steps()).toEqual([
      "Start your self analysis",
      "Write your first idea",
    ]);
  });

  test("a Viewer gets the one line only", () => {
    renderAs("viewer");
    expect(screen.queryByRole("list")).toBeNull();
    expect(
      screen.getByText(
        "This workspace has no ideas yet. They show up here once the team writes them.",
      ),
    ).toBeTruthy();
  });
});
