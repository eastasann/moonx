import { expect, test } from "vitest";
import { navigation } from "../src/lib/navigation";
import { makeMe, OTHER, PERSONAL, WORKSPACE } from "./support";

const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);

test("an Owner sees every destination and Settings", () => {
  const nav = navigation(makeMe(), WORKSPACE, `/w/${WORKSPACE}`);
  expect(ids(nav.main)).toEqual([
    "dashboard",
    "ideas",
    "self-analysis",
    "notifications",
    "decisions",
  ]);
  expect(ids(nav.secondary)).toEqual(["settings"]);
  expect(ids(nav.tabs)).toEqual(["dashboard", "ideas", "self-analysis", "notifications"]);
  expect(ids(nav.more)).toEqual(["decisions", "settings"]);
});

test("a Viewer has no Self Analysis and no Settings", () => {
  const me = makeMe({
    memberships: [
      {
        workspace: { id: WORKSPACE, name: "BCDX", isPersonal: false, currency: "PHP" },
        role: "viewer",
      },
    ],
  });
  const nav = navigation(me, WORKSPACE, `/w/${WORKSPACE}/ideas`);
  expect(ids(nav.main)).toEqual(["dashboard", "ideas", "notifications", "decisions"]);
  expect(nav.secondary).toEqual([]);
});

test("an operator also gets Admin", () => {
  const nav = navigation(makeMe({ isAdmin: true }), WORKSPACE, "/admin/templates");
  expect(ids(nav.secondary)).toEqual(["settings", "admin"]);
  expect(nav.secondary.find((entry) => entry.id === "admin")?.isCurrent).toBe(true);
});

test("the current destination follows the path, and Dashboard only matches exactly", () => {
  const base = `/w/${WORKSPACE}`;
  const current = (pathname: string) =>
    navigation(makeMe(), WORKSPACE, pathname)
      .main.filter((entry) => entry.isCurrent)
      .map((e) => e.id);
  expect(current(base)).toEqual(["dashboard"]);
  expect(current(`${base}/ideas/abc/costs`)).toEqual(["ideas"]);
  expect(current("/notifications")).toEqual(["notifications"]);
  expect(current("/account")).toEqual([]);
});

test("a workspace the person does not belong to leaves only Notifications", () => {
  const nav = navigation(makeMe(), OTHER, "/account");
  expect(nav.workspaceId).toBeNull();
  expect(ids(nav.main)).toEqual(["notifications"]);
});

test("the links point into the chosen workspace", () => {
  const nav = navigation(makeMe(), PERSONAL, "/account");
  expect(nav.main[1]?.href).toBe(`/w/${PERSONAL}/ideas`);
});
