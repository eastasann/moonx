import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { NewIdeaDialog } from "../src/components/NewIdeaDialog";
import { i18n } from "../src/lib/i18n";
import { overlaySearchSchema } from "../src/lib/overlay";
import { ME_KEY } from "../src/lib/session";
import { makeMe, stubApi, WORKSPACE } from "./support";
import { makeIdea } from "./support-ideas";

afterEach(() => {
  vi.unstubAllGlobals();
});

const CREATED = makeIdea({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Cebu Bakery" });
const POST = `POST /api/v1/workspaces/${WORKSPACE}/ideas`;

/**
 * M1 over `/w/$workspaceId?modal=new-idea`, without the app frame: the dialog only needs the
 * workspace from the URL. The frame test of the same dialog is in new-idea-host.test.tsx.
 */
function renderDialog() {
  const root = createRootRoute({ validateSearch: overlaySearchSchema });
  const workspace = createRoute({
    getParentRoute: () => root,
    path: "/w/$workspaceId",
    validateSearch: overlaySearchSchema,
    component: NewIdeaDialog,
  });
  const router = createRouter({
    routeTree: root.addChildren([workspace]),
    defaultNotFoundComponent: () => null,
    history: createMemoryHistory({ initialEntries: [`/w/${WORKSPACE}?modal=new-idea`] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  queryClient.setQueryData(ME_KEY, makeMe());
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return router;
}

const dialog = () => screen.findByRole("dialog", { name: "New idea" });
const fill = (scope: HTMLElement, label: RegExp, value: string) =>
  fireEvent.change(within(scope).getByRole("textbox", { name: label }), { target: { value } });
const createButton = (scope: HTMLElement) =>
  within(scope).getByRole("button", { name: "Create idea" });

test("the decision button stays disabled until the name and the concept are filled", async () => {
  stubApi({});
  renderDialog();
  const form = await dialog();
  expect(createButton(form)).toBeDisabled();
  fill(form, /^Name/, "Cebu Bakery");
  expect(createButton(form)).toBeDisabled();
  fill(form, /^One-line concept/, "   ");
  expect(createButton(form)).toBeDisabled();
  fill(form, /^One-line concept/, "Fresh pandesal for office workers");
  expect(createButton(form)).toBeEnabled();
  expect(within(form).getByRole("textbox", { name: /^Proposed solution/ })).not.toBeRequired();
});

test("creating posts the trimmed fields and opens the new idea", async () => {
  const api = stubApi({ [POST]: () => ({ status: 201, body: CREATED }) });
  const router = renderDialog();
  const form = await dialog();
  fill(form, /^Name/, "  Cebu Bakery ");
  fill(form, /^One-line concept/, "Fresh pandesal for office workers");
  fill(form, /^Proposed solution/, "A cart outside the ferry terminal");
  fireEvent.click(createButton(form));
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
  const api = stubApi({ [POST]: () => ({ status: 201, body: CREATED }) });
  const router = renderDialog();
  const form = await dialog();
  fill(form, /^Name/, "Cebu Bakery");
  fill(form, /^One-line concept/, "Fresh pandesal");
  fireEvent.click(createButton(form));
  await waitFor(() => expect(router.state.location.pathname).toContain(CREATED.id));
  expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({
    name: "Cebu Bakery",
    oneLineConcept: "Fresh pandesal",
  });
});

test("a name over 100 characters is refused under the field and nothing is sent", async () => {
  const api = stubApi({ [POST]: () => ({ status: 201, body: CREATED }) });
  renderDialog();
  const form = await dialog();
  fill(form, /^Name/, "x".repeat(101));
  fill(form, /^One-line concept/, "Fresh pandesal");
  fireEvent.click(createButton(form));
  expect(await within(form).findByText("Use at most 100 characters")).toBeInTheDocument();
  expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
});

test("a concept over 200 characters is refused under the field", async () => {
  const api = stubApi({ [POST]: () => ({ status: 201, body: CREATED }) });
  renderDialog();
  const form = await dialog();
  fill(form, /^Name/, "Cebu Bakery");
  fill(form, /^One-line concept/, "x".repeat(201));
  fireEvent.click(createButton(form));
  expect(await within(form).findByText("Use at most 200 characters")).toBeInTheDocument();
  expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
});

test("a failed save keeps the input, says Couldn't save — Retry, and a retry succeeds", async () => {
  let attempts = 0;
  const api = stubApi({
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
  const router = renderDialog();
  const form = await dialog();
  fill(form, /^Name/, "Cebu Bakery");
  fill(form, /^One-line concept/, "Fresh pandesal");
  fireEvent.click(createButton(form));
  expect(await within(form).findByText("Couldn't save — Retry")).toBeInTheDocument();
  expect(within(form).getByRole("textbox", { name: /^Name/ })).toHaveValue("Cebu Bakery");
  expect(within(form).getByRole("textbox", { name: /^One-line concept/ })).toHaveValue(
    "Fresh pandesal",
  );
  expect(router.state.location.search).toMatchObject({ modal: "new-idea" });
  fireEvent.click(createButton(form));
  await waitFor(() => expect(router.state.location.pathname).toContain(CREATED.id));
  expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(2);
});

test("a second press while the save is in flight does not send twice", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const api = stubApi({ [POST]: () => ({ status: 201, body: CREATED }) });
  const slow = globalThis.fetch;
  vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
    await gate;
    return slow(...args);
  });
  const router = renderDialog();
  const form = await dialog();
  fill(form, /^Name/, "Cebu Bakery");
  fill(form, /^One-line concept/, "Fresh pandesal");
  fireEvent.click(createButton(form));
  await waitFor(() => expect(createButton(form)).toHaveAttribute("aria-disabled", "true"));
  fireEvent.click(createButton(form));
  release();
  await waitFor(() => expect(router.state.location.pathname).toContain(CREATED.id));
  expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(1);
});
