import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { autosave } from "../src/lib/autosave";
import { makeMe, renderApp, stubApi } from "./support";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function signedIn() {
  const me = makeMe();
  const stub = stubApi({
    "GET /api/v1/me": () => ({ body: me }),
    "PATCH /api/v1/me": ({ body }) => ({ body: { ...me, ...(body as object) } }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
  });
  return { me, ...stub };
}

const patches = (calls: { method: string; body: unknown }[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => call.body);

test("the display name has no Save button and saves once typing rests", async () => {
  const { calls } = signedIn();
  await renderApp("/account");
  const field = await screen.findByRole("textbox", { name: /Display name/ });
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

  await userEvent.clear(field);
  await userEvent.type(field, "Ana Reyes");
  expect(patches(calls)).toEqual([]);
  await vi.waitFor(
    () => expect(patches(calls)).toEqual([{ displayName: "Ana Reyes", lockVersion: 0 }]),
    {
      timeout: 3000,
    },
  );
  expect(await screen.findByText("Saved")).toBeInTheDocument();
});

test("leaving the field saves at once, and an empty name is not sent", async () => {
  const { calls } = signedIn();
  await renderApp("/account");
  const field = await screen.findByRole("textbox", { name: /Display name/ });

  await userEvent.clear(field);
  await userEvent.tab();
  expect(await screen.findAllByText("Required")).not.toHaveLength(0);
  expect(patches(calls)).toEqual([]);

  await userEvent.type(field, "Ana");
  await userEvent.tab();
  await vi.waitFor(() => expect(patches(calls)).toEqual([{ displayName: "Ana", lockVersion: 0 }]));
});

test("the delete confirmation says team workspaces stay", async () => {
  signedIn();
  await renderApp("/account");
  await userEvent.click(await screen.findByRole("button", { name: "Delete account" }));
  expect(await screen.findByText(/Team workspaces stay/)).toHaveTextContent(
    "including any where you are the only member",
  );
  expect(screen.queryByText(/workspaces where you are the only member\./)).toBeNull();
});

test("a name changed back while the first save is on its way is still sent, in order", async () => {
  const { calls, fetchStub } = signedIn();
  const real = fetchStub.getMockImplementation() as typeof fetch;
  let release: () => void = () => {};
  let held = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH" && !held) {
        held = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return real(input, init);
    }),
  );
  await renderApp("/account");
  const field = await screen.findByRole("textbox", { name: /Display name/ });
  await userEvent.clear(field);
  await userEvent.type(field, "Anna");
  await userEvent.tab();
  await vi.waitFor(() => expect(held).toBe(true));
  await userEvent.clear(field);
  await userEvent.type(field, "Ana Villanueva");
  await userEvent.tab();
  expect(patches(calls)).toEqual([]);
  release();
  await vi.waitFor(() =>
    expect(patches(calls)).toEqual([
      { displayName: "Anna", lockVersion: 0 },
      { displayName: "Ana Villanueva", lockVersion: 0 },
    ]),
  );
});

test("a name still resting in the timer is sent before logging out", async () => {
  const { calls } = signedIn();
  await renderApp("/account");
  const field = await screen.findByRole("textbox", { name: /Display name/ });
  await userEvent.clear(field);
  await userEvent.type(field, "Ana Reyes");
  expect(patches(calls)).toEqual([]);
  await autosave.flushAll();
  expect(patches(calls)).toEqual([{ displayName: "Ana Reyes", lockVersion: 0 }]);
});
