import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { makeMe, renderApp, stubApi, WORKSPACE } from "./support";
import { makeIdea } from "./support-ideas";

afterEach(() => {
  vi.unstubAllGlobals();
});

const CREATED = makeIdea({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Cebu Bakery" });
const POST = `POST /api/v1/workspaces/${WORKSPACE}/ideas`;

const signedIn = (me = makeMe()) => ({
  "GET /api/v1/me": () => ({ body: me }),
  "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
  [`GET /api/v1/workspaces/${WORKSPACE}/ideas`]: () => ({
    body: { items: [], nextCursor: null, hiddenDroppedCount: 0 },
  }),
  [`GET /api/v1/workspaces/${WORKSPACE}/members`]: () => ({ body: { items: [] } }),
});

/** M1 opened over the workspace's own page with `?modal=new-idea`. */
const renderDialog = () => renderApp(`/w/${WORKSPACE}?modal=new-idea`);

const dialog = () => screen.findByRole("dialog", { name: "New idea" });
const fill = async (scope: HTMLElement, label: RegExp, value: string) => {
  const field = within(scope).getByRole("textbox", { name: label });
  await userEvent.clear(field);
  await userEvent.type(field, value);
};
const createButton = (scope: HTMLElement) =>
  within(scope).getByRole("button", { name: "Create idea" });

test("the decision button stays disabled until the name and the concept are filled", async () => {
  stubApi(signedIn());
  await renderDialog();
  const form = await dialog();
  expect(createButton(form)).toBeDisabled();
  await fill(form, /^Name/, "Cebu Bakery");
  expect(createButton(form)).toBeDisabled();
  await fill(form, /^One-line concept/, "   ");
  expect(createButton(form)).toBeDisabled();
  await fill(form, /^One-line concept/, "Fresh pandesal for office workers");
  expect(createButton(form)).toBeEnabled();
  expect(within(form).getByRole("textbox", { name: /^Proposed solution/ })).not.toBeRequired();
});

test("creating posts the trimmed fields and opens the new idea", async () => {
  const api = stubApi({ ...signedIn(), [POST]: () => ({ status: 201, body: CREATED }) });
  const { router } = await renderDialog();
  const form = await dialog();
  await fill(form, /^Name/, "  Cebu Bakery ");
  await fill(form, /^One-line concept/, "Fresh pandesal for office workers");
  await fill(form, /^Proposed solution/, "A cart outside the ferry terminal");
  await userEvent.click(createButton(form));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/ideas/${CREATED.id}`),
  );
  expect(router.state.location.search).toEqual({});
  expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({
    name: "Cebu Bakery",
    oneLineConcept: "Fresh pandesal for office workers",
    proposedSolution: "A cart outside the ferry terminal",
  });
});

test("an empty proposed solution is not sent", async () => {
  const api = stubApi({ ...signedIn(), [POST]: () => ({ status: 201, body: CREATED }) });
  const { router } = await renderDialog();
  const form = await dialog();
  await fill(form, /^Name/, "Cebu Bakery");
  await fill(form, /^One-line concept/, "Fresh pandesal");
  await userEvent.click(createButton(form));
  await waitFor(() => expect(router.state.location.pathname).toContain(CREATED.id));
  expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({
    name: "Cebu Bakery",
    oneLineConcept: "Fresh pandesal",
  });
});

test("a name over 100 characters is refused under the field and nothing is sent", async () => {
  const api = stubApi({ ...signedIn(), [POST]: () => ({ status: 201, body: CREATED }) });
  await renderDialog();
  const form = await dialog();
  await fill(form, /^Name/, "x".repeat(101));
  await fill(form, /^One-line concept/, "Fresh pandesal");
  await userEvent.click(createButton(form));
  expect(await within(form).findByText("Use at most 100 characters")).toBeInTheDocument();
  expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
});

test("a concept over 200 characters is refused under the field", async () => {
  const api = stubApi({ ...signedIn(), [POST]: () => ({ status: 201, body: CREATED }) });
  await renderDialog();
  const form = await dialog();
  await fill(form, /^Name/, "Cebu Bakery");
  await fill(form, /^One-line concept/, "x".repeat(201));
  await userEvent.click(createButton(form));
  expect(await within(form).findByText("Use at most 200 characters")).toBeInTheDocument();
  expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
});

test("a failed save keeps the input, says Couldn't save — Retry, and a retry succeeds", async () => {
  let attempts = 0;
  const api = stubApi({
    ...signedIn(),
    [POST]: () => {
      attempts += 1;
      return attempts === 1
        ? {
            status: 500,
            body: { error: { code: "INTERNAL", message: "boom", requestId: "abcdef12-0000" } },
          }
        : { status: 201, body: CREATED };
    },
  });
  const { router } = await renderDialog();
  const form = await dialog();
  await fill(form, /^Name/, "Cebu Bakery");
  await fill(form, /^One-line concept/, "Fresh pandesal");
  await userEvent.click(createButton(form));
  expect(await within(form).findByText("Couldn't save — Retry")).toBeInTheDocument();
  expect(within(form).getByRole("textbox", { name: /^Name/ })).toHaveValue("Cebu Bakery");
  expect(within(form).getByRole("textbox", { name: /^One-line concept/ })).toHaveValue(
    "Fresh pandesal",
  );
  expect(router.state.location.search).toMatchObject({ modal: "new-idea" });
  await userEvent.click(createButton(form));
  await waitFor(() => expect(router.state.location.pathname).toContain(CREATED.id));
  expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(2);
});

test("a second press while the save is in flight does not send twice", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const api = stubApi({ ...signedIn(), [POST]: () => ({ status: 201, body: CREATED }) });
  const { router } = await renderDialog();
  const form = await dialog();
  const slow = globalThis.fetch;
  vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
    await gate;
    return slow(...args);
  });
  await fill(form, /^Name/, "Cebu Bakery");
  await fill(form, /^One-line concept/, "Fresh pandesal");
  await userEvent.click(createButton(form));
  await waitFor(() => expect(createButton(form)).toHaveAttribute("aria-disabled", "true"));
  await userEvent.click(createButton(form));
  release();
  await waitFor(() => expect(router.state.location.pathname).toContain(CREATED.id));
  expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(1);
});

test("?modal=new-idea opens M1 over the screen it was opened from", async () => {
  stubApi(signedIn());
  const { router } = await renderApp(`/w/${WORKSPACE}/ideas?modal=new-idea`);
  const form = await dialog();
  expect(within(form).getByRole("textbox", { name: /^Name/ })).toBeInTheDocument();
  expect(createButton(form)).toBeDisabled();
  expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/ideas`);
});

test("?modal=new-idea shows nothing to a Viewer of the workspace", async () => {
  const me = makeMe();
  stubApi(
    signedIn(
      makeMe({
        memberships: me.memberships.map((m) =>
          m.workspace.id === WORKSPACE ? { ...m, role: "viewer" as const } : m,
        ),
      }),
    ),
  );
  await renderApp(`/w/${WORKSPACE}/ideas?modal=new-idea`);
  await screen.findByRole("heading", { name: "Ideas" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
