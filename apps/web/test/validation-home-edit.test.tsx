import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { autosave } from "../src/lib/autosave";
import {
  conflictAnswer,
  HOME_PATH,
  IDEA_PATH,
  makeDetail,
  openEditSheet,
  patchesOf,
  stubEditApi,
} from "./support-validation-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

const nameBox = (dialog: HTMLElement) => within(dialog).getByRole("textbox", { name: /^Name/ });

test("the sheet has no Save button, and a field is saved when the person leaves it", async () => {
  const api = stubEditApi({
    [`PATCH ${IDEA_PATH}`]: () => ({ body: makeDetail({ name: "Piaya Boxes", lockVersion: 4 }) }),
  });
  const { dialog, user } = await openEditSheet();
  expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
  expect(nameBox(dialog)).toHaveValue("Piaya Gift Box Delivery");
  expect(within(dialog).getByRole("textbox", { name: "Proposed solution" })).toHaveValue(
    "Same-day boxes",
  );
  await user.clear(nameBox(dialog));
  await user.type(nameBox(dialog), "  Piaya Boxes ");
  await user.tab();
  await waitFor(() => expect(patchesOf(api)).toHaveLength(1));
  expect(patchesOf(api)[0]?.body).toEqual({ name: "Piaya Boxes", lockVersion: 3 });
});

test("a cleared proposed solution is sent as null, and closing the sheet sends what rests", async () => {
  const api = stubEditApi({
    [`PATCH ${IDEA_PATH}`]: () => ({
      body: makeDetail({ proposedSolution: null, lockVersion: 4 }),
    }),
  });
  const { dialog, user } = await openEditSheet();
  await user.clear(within(dialog).getByRole("textbox", { name: "Proposed solution" }));
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit summary" })).toBeNull());
  await waitFor(() => expect(patchesOf(api)).toHaveLength(1));
  expect(patchesOf(api)[0]?.body).toEqual({ proposedSolution: null, lockVersion: 3 });
});

test("a save sent while the sheet closes still refreshes the home behind it", async () => {
  const api = stubEditApi({
    [`PATCH ${IDEA_PATH}`]: () => ({ body: makeDetail({ name: "Piaya Boxes", lockVersion: 4 }) }),
  });
  const { dialog, user } = await openEditSheet();
  const homeReads = () => api.calls.filter((c) => c.url.pathname === HOME_PATH).length;
  const before = homeReads();
  await user.type(nameBox(dialog), "!");
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(patchesOf(api)).toHaveLength(1));
  await waitFor(() => expect(homeReads()).toBeGreaterThan(before));
});

test("Retry leaves out a field that fails the check", async () => {
  let attempts = 0;
  const api = stubEditApi({
    [`PATCH ${IDEA_PATH}`]: () => {
      attempts += 1;
      return attempts === 1
        ? { status: 403, body: { error: { code: "FORBIDDEN", message: "no", requestId: "r" } } }
        : { body: makeDetail({ lockVersion: 4 }) };
    },
  });
  const { dialog, user } = await openEditSheet();
  await user.type(within(dialog).getByRole("textbox", { name: "Proposed solution" }), "!");
  await user.tab();
  const retry = await within(dialog).findByRole("button", { name: "Retry" });
  await user.clear(nameBox(dialog));
  await user.click(retry);
  await waitFor(() => expect(patchesOf(api)).toHaveLength(2));
  expect(patchesOf(api)[1]?.body).not.toHaveProperty("name");
});

test("an empty name is refused with its reason and nothing is sent for it", async () => {
  const api = stubEditApi({});
  const { dialog, user } = await openEditSheet();
  await user.clear(nameBox(dialog));
  await user.tab();
  expect(await within(dialog).findByText("Required")).toBeInTheDocument();
  expect(patchesOf(api)).toHaveLength(0);
});

test("a name that became empty sends the last valid text at once, never the empty one", async () => {
  const api = stubEditApi({
    [`PATCH ${IDEA_PATH}`]: () => ({ body: makeDetail({ name: "Pia", lockVersion: 4 }) }),
  });
  const { dialog, user } = await openEditSheet();
  await user.clear(nameBox(dialog));
  await user.type(nameBox(dialog), "Pia");
  await user.clear(nameBox(dialog));
  await within(dialog).findByText("Required");
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit summary" })).toBeNull());
  await autosave.idle();
  expect(patchesOf(api).map((patch) => patch.body)).toEqual([{ name: "Pia", lockVersion: 3 }]);
});

test("an archived refusal is shown in the sheet with its own text", async () => {
  stubEditApi({
    [`PATCH ${IDEA_PATH}`]: () => ({
      status: 409,
      body: { error: { code: "ARCHIVED", message: "archived", requestId: "r" } },
    }),
  });
  const { dialog, user } = await openEditSheet();
  await user.type(nameBox(dialog), "!");
  await user.tab();
  expect(
    await within(dialog).findByText("This is archived. Restore it to make changes."),
  ).toBeInTheDocument();
});

async function conflictAfterTyping() {
  let attempts = 0;
  const api = stubEditApi({
    [`PATCH ${IDEA_PATH}`]: () => {
      attempts += 1;
      return attempts === 1 ? conflictAnswer() : { body: makeDetail({ lockVersion: 5 }) };
    },
  });
  const { dialog, user } = await openEditSheet();
  await user.clear(nameBox(dialog));
  await user.type(nameBox(dialog), "My name");
  await user.tab();
  const conflict = await screen.findByRole("dialog", { name: "Someone updated this first" });
  return { api, dialog, user, conflict };
}

test("a 409 shows their version beside mine, and Overwrite with mine sends force with their version number", async () => {
  const { api, user, conflict } = await conflictAfterTyping();
  expect(within(conflict).getByText(/Paolo Reyes updated this summary/)).toBeInTheDocument();
  expect(within(conflict).getByText(/Name: Piaya Boxes/)).toBeInTheDocument();
  expect(within(conflict).getByText(/One-line concept: Their concept/)).toBeInTheDocument();
  await user.click(within(conflict).getByRole("button", { name: "Overwrite with mine" }));
  await waitFor(() => expect(patchesOf(api)).toHaveLength(2));
  expect(patchesOf(api)[1]?.body).toMatchObject({ name: "My name", lockVersion: 4, force: true });
});

test("Load theirs replaces the form with their version, and the next save follows their version", async () => {
  const { api, dialog, user, conflict } = await conflictAfterTyping();
  await user.click(within(conflict).getByRole("button", { name: "Load theirs" }));
  await waitFor(() => expect(nameBox(dialog)).toHaveValue("Piaya Boxes"));
  expect(within(dialog).getByRole("textbox", { name: "Proposed solution" })).toHaveValue("");
  await user.type(within(dialog).getByRole("textbox", { name: "Proposed solution" }), "x");
  await user.tab();
  await waitFor(() => expect(patchesOf(api)).toHaveLength(2));
  expect(patchesOf(api)[1]?.body).toMatchObject({ proposedSolution: "x", lockVersion: 4 });
  expect(patchesOf(api)[1]?.body).not.toHaveProperty("force");
});

test("Copy my input puts the person's own text on the clipboard before Load theirs drops it", async () => {
  const { user, conflict } = await conflictAfterTyping();
  // user-event installs its own clipboard when it is set up, so the spy goes on after that.
  const writeText = vi.spyOn(navigator.clipboard, "writeText");
  await user.click(within(conflict).getByRole("button", { name: "Copy my input" }));
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText.mock.calls[0]?.[0]).toContain("Name: My name");
  expect(writeText.mock.calls[0]?.[0]).toContain("One-line concept: ");
  expect(writeText.mock.calls[0]?.[0]).toContain("Proposed solution: ");
});
