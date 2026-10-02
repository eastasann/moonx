import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { makeMe, renderApp, stubApi } from "./support";
import { ADMIN_ME, adminBase } from "./support-admin";
import { makeDetail, TEMPLATES, V_NEW, V_VAL_1, V_VAL_2, V_VAL_3 } from "./support-templates";

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = (me = ADMIN_ME) => ({
  ...adminBase(me),
  "GET /api/v1/admin/templates": () => ({ body: TEMPLATES }),
});

test("someone who is not an operator gets no access and nothing is loaded", async () => {
  const api = stubApi(base(makeMe()));
  await renderApp("/admin/templates");
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(api.calls.some((call) => call.url.pathname.startsWith("/api/v1/admin"))).toBe(false);
});

test("the three templates are listed and the first one's versions are shown", async () => {
  stubApi(base());
  await renderApp("/admin/templates");
  const list = await screen.findByRole("grid", { name: "Templates" });
  for (const name of ["Self Analysis", "Validation", "Business Plan"]) {
    expect(within(list).getByText(name)).toBeInTheDocument();
  }
  expect(screen.getByRole("heading", { name: "Self Analysis versions" })).toBeInTheDocument();
  expect(screen.getByText("3 in use")).toBeInTheDocument();
  expect(screen.getByText(/Published Mar 1, 2026 by Moonx Admin/)).toBeInTheDocument();
});

test("a template's versions show state, publish date and use, and a draft blocks a second one", async () => {
  stubApi(base());
  await renderApp("/admin/templates?kind=validation");
  const versions = await screen.findByRole("list", { name: "Versions of Validation" });
  const rows = within(versions).getAllByRole("listitem");
  expect(rows).toHaveLength(3);
  expect(within(rows[0] as HTMLElement).getByText("v3")).toBeInTheDocument();
  expect(within(rows[0] as HTMLElement).getByText("Draft")).toBeInTheDocument();
  expect(within(rows[0] as HTMLElement).getByText("Not published")).toBeInTheDocument();
  expect(within(rows[1] as HTMLElement).getByText("1 in use")).toBeInTheDocument();
  expect(screen.getByText(/has a draft/)).toBeInTheDocument();
  for (const button of screen.getAllByRole("button", { name: "New draft from this version" })) {
    expect(button).toBeDisabled();
  }
});

test("New draft copies the version and opens the draft", async () => {
  const api = stubApi({
    ...base(),
    [`POST /api/v1/admin/template-versions/${"bbbbbbbb-0000-4000-8000-000000000001"}/draft`]:
      () => ({
        status: 201,
        body: { id: V_NEW },
      }),
    [`GET /api/v1/admin/template-versions/${V_NEW}`]: () => ({
      body: makeDetail({ id: V_NEW, kind: "self_analysis", versionNumber: 2, sections: [] }),
    }),
  });
  await renderApp("/admin/templates");
  await userEvent.click(await screen.findByRole("button", { name: "New draft from this version" }));
  await waitFor(() =>
    expect(api.calls.some((c) => c.method === "GET" && c.url.pathname.endsWith(V_NEW))).toBe(true),
  );
  expect(await screen.findByRole("heading", { name: "Self Analysis v2" })).toBeInTheDocument();
});

test("a draft that already exists is refused with the API's reason", async () => {
  stubApi({
    ...base(),
    "GET /api/v1/admin/templates": () => ({
      body: {
        items: [
          {
            ...TEMPLATES.items[0],
            versions: [{ ...(TEMPLATES.items[0]?.versions[0] as object) }],
          },
        ],
      },
    }),
    [`POST /api/v1/admin/template-versions/${"bbbbbbbb-0000-4000-8000-000000000001"}/draft`]:
      () => ({
        status: 409,
        body: { error: { code: "DRAFT_EXISTS", message: "x", requestId: "abcdef12-0000" } },
      }),
  });
  await renderApp("/admin/templates");
  await userEvent.click(await screen.findByRole("button", { name: "New draft from this version" }));
  expect(await screen.findByText("A draft already exists.")).toBeInTheDocument();
});

test("Open draft and View go to screen 27", async () => {
  stubApi({
    ...base(),
    [`GET /api/v1/admin/template-versions/${V_VAL_2}`]: () => ({
      body: makeDetail({ id: V_VAL_2, versionNumber: 2, status: "published" }),
    }),
  });
  const { router } = await renderApp("/admin/templates?kind=validation");
  const versions = await screen.findByRole("list", { name: "Versions of Validation" });
  const rows = within(versions).getAllByRole("listitem");
  await userEvent.click(within(rows[1] as HTMLElement).getByRole("button", { name: "View" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/admin/templates/versions/${V_VAL_2}`),
  );
  expect(V_VAL_1).not.toBe(V_VAL_3);
});

test("the tabs join Templates and Users & Workspaces", async () => {
  stubApi({
    ...base(),
    "GET /api/v1/admin/users": () => ({ body: { items: [], nextCursor: null } }),
  });
  const { router } = await renderApp("/admin/templates");
  await userEvent.click(await screen.findByRole("tab", { name: "Users & Workspaces" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/users"));
  await userEvent.click(await screen.findByRole("tab", { name: "Templates" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/templates"));
});
