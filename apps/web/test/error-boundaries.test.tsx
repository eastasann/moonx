import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emptyDashboard, makeMe, renderApp, stubApi, WORKSPACE } from "./support";

vi.mock("../src/components/CommentsPanel", () => ({
  CommentsPanel: () => {
    throw new Error("panel broke");
  },
}));
vi.mock("../src/components/NewIdeaDialog", () => ({
  NewIdeaDialog: () => {
    throw new Error("modal broke");
  },
}));

vi.mock("../src/screens/Notifications", () => ({
  Notifications: () => {
    throw new Error("screen broke");
  },
}));

const TARGET = "validation_answer:66666666-6666-4666-8666-666666666666:V.01.WHO";

beforeEach(() => {
  // React logs every error a boundary catches.
  vi.spyOn(console, "error").mockImplementation(() => {});
  stubApi({
    "GET /api/v1/me": () => ({ body: makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    ...emptyDashboard(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("a panel that fails to render shows Something went wrong and leaves the frame, the nav and the screen working", async () => {
  const { router } = await renderApp(`/w/${WORKSPACE}?panel=comments&target=${TARGET}`);
  const dialog = await screen.findByRole("dialog", { name: "Something went wrong" });
  expect(
    screen.getByRole("heading", { level: 1, name: "Dashboard", hidden: true }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("navigation", { hidden: true }).length).toBeGreaterThan(0);
  await userEvent.click(within(dialog).getAllByRole("button", { name: "Close" })[0] as HTMLElement);
  await waitFor(() => expect(router.state.location.search).toEqual({}));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("heading", { level: 1, name: "Dashboard", hidden: true }),
  ).toBeInTheDocument();
});

test("a modal that fails to render does not break the screen behind it, and can be closed", async () => {
  const { router } = await renderApp(`/w/${WORKSPACE}?modal=new-idea`);
  const dialog = await screen.findByRole("dialog", { name: "Something went wrong" });
  expect(
    screen.getByRole("heading", { level: 1, name: "Dashboard", hidden: true }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("navigation", { hidden: true }).length).toBeGreaterThan(0);
  await userEvent.click(within(dialog).getAllByRole("button", { name: "Close" })[0] as HTMLElement);
  await waitFor(() => expect(router.state.location.search).toEqual({}));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a screen that fails to render is cleared by the next navigation", async () => {
  const { router } = await renderApp(`/w/${WORKSPACE}`);
  await screen.findByRole("heading", { level: 1, name: "Dashboard", hidden: true });
  router.history.push("/notifications");
  expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  router.history.push(`/w/${WORKSPACE}`);
  await waitFor(() => expect(screen.queryByText("Something went wrong")).toBeNull());
  expect(
    await screen.findByRole("heading", { level: 1, name: "Dashboard", hidden: true }),
  ).toBeInTheDocument();
});
