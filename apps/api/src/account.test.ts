import { afterAll, describe, expect, test } from "bun:test";
import {
  accounts,
  changeHistory,
  comments,
  executionItems,
  ideas,
  invitations,
  memberships,
  notifications,
  rateLimits,
  selfAnalyses,
  sessions,
  users,
  verifications,
  workspaces,
} from "@moonx/db";
import { errorBodySchema, meSchema } from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { DELETION_PASSWORD_LIMIT } from "./account";
import { DELETED_USER_NAME } from "./account-deletion";
import type { AvatarStore } from "./avatars";
import { ApiError } from "./errors";
import { lockMembers } from "./membership";
import { buildTestApp, connectTestDatabase, uniqueIp } from "./test-app";
import {
  apiRequest,
  duringAccountDeletion,
  photoForm,
  signIn,
  TEST_PASSWORD,
  testFixtures,
  testPng,
  uniqueEmail,
  untilBlockedBy,
} from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const testApp = buildTestApp(database);
const { app } = testApp;
const MINUTE_MS = 60 * 1000;

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

const userRow = async (id: string) =>
  (await db.select().from(users).where(eq(users.id, id)))[0];

/** A user signed in, with the cookie of their session. */
async function signedInUser(
  options: Parameters<typeof fixtures.createUser>[0] = {},
  target = app,
) {
  const user = await fixtures.createUser(options);
  return { user, cookie: await signIn(target, user.email, uniqueIp()) };
}

/** The personal workspace the first sign-in made for `userId`. */
async function personalWorkspace(userId: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(
      and(eq(workspaces.createdById, userId), eq(workspaces.isPersonal, true)),
    );
  if (workspace === undefined) throw new Error("no personal workspace");
  return workspace;
}

/** Turns `userId` into a user who signed up with Google and has no password. */
async function dropPassword(userId: string) {
  await db
    .update(accounts)
    .set({
      providerId: "google",
      accountId: `google-${userId}`,
      password: null,
    })
    .where(eq(accounts.userId, userId));
}

describe("U1 GET /api/v1/me", () => {
  test("answers the signed-in user with their workspaces in the order they joined", async () => {
    const { user, cookie } = await signedInUser({ displayName: "Mia" });
    const first = await fixtures.createWorkspace({ name: "First" });
    const second = await fixtures.createWorkspace({ name: "Second" });
    await fixtures.addMember(first.id, user.id, "viewer");
    await fixtures.addMember(second.id, user.id, "owner");

    const response = await app.handle(
      apiRequest("GET", "/api/v1/me", { cookie }),
    );

    expect(response.status).toBe(200);
    const me = meSchema.parse(await response.json());
    expect(me).toMatchObject({
      id: user.id,
      email: user.email,
      displayName: "Mia",
      avatarUrl: null,
      theme: "system",
      isAdmin: false,
      hasPassword: true,
    });
    expect(
      me.memberships.map(({ workspace, role }) => [workspace.name, role]),
    ).toEqual([
      // Made by the first sign-in (SDD 5.4「登録の後」).
      ["Mia's workspace", "owner"],
      ["First", "viewer"],
      ["Second", "owner"],
    ]);
  });
});

describe("U2 PATCH /api/v1/me", () => {
  test("changes only the fields sent", async () => {
    const { user, cookie } = await signedInUser({ displayName: "Before" });

    const response = await app.handle(
      apiRequest("PATCH", "/api/v1/me", {
        cookie,
        body: { displayName: "After", timezone: "Asia/Tokyo", theme: "dark" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      displayName: "After",
      timezone: "Asia/Tokyo",
      theme: "dark",
    });
    const row = await userRow(user.id);
    expect(row).toMatchObject({ displayName: "After", email: user.email });
    expect(row?.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());
  });

  test("restores nothing of an account deleted while the request waits", async () => {
    const { user, cookie } = await signedInUser({ displayName: "Before" });

    const response = await duringAccountDeletion(db, user.id, () =>
      app.handle(
        apiRequest("PATCH", "/api/v1/me", {
          cookie,
          body: { displayName: "After" },
        }),
      ),
    );

    expect(response.status).toBe(401);
    expect((await userRow(user.id))?.displayName).toBe("Before");
  });

  test("moves the last workspace to one of the caller's, without touching the profile date", async () => {
    const { user, cookie } = await signedInUser();
    const workspace = await fixtures.createWorkspace();
    await fixtures.addMember(workspace.id, user.id, "member");

    const response = await app.handle(
      apiRequest("PATCH", "/api/v1/me", {
        cookie,
        body: { lastWorkspaceId: workspace.id },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      lastWorkspaceId: workspace.id,
    });
    expect((await userRow(user.id))?.updatedAt).toEqual(user.updatedAt);
  });

  test("refuses a last workspace the caller is not in", async () => {
    const { cookie } = await signedInUser();
    const elsewhere = await fixtures.createWorkspace();

    const response = await app.handle(
      apiRequest("PATCH", "/api/v1/me", {
        cookie,
        body: { lastWorkspaceId: elsewhere.id },
      }),
    );

    expect(response.status).toBe(422);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details?.[0]?.path).toBe("lastWorkspaceId");
  });

  test("refuses values outside the rules of design-spec 6.0.8", async () => {
    const { cookie } = await signedInUser();
    for (const [body, path] of [
      [{ displayName: "   " }, "displayName"],
      [{ displayName: "x".repeat(61) }, "displayName"],
      [{ timezone: "Mars/Olympus" }, "timezone"],
      [{ theme: "sepia" }, "theme"],
    ] as const) {
      const response = await app.handle(
        apiRequest("PATCH", "/api/v1/me", { cookie, body }),
      );
      expect(response.status).toBe(422);
      expect((await errorOf(response)).details?.[0]?.path).toBe(path);
    }
  });

  test("leaves the row alone when nothing changes", async () => {
    const { user, cookie } = await signedInUser({ displayName: "Same" });

    const response = await app.handle(
      apiRequest("PATCH", "/api/v1/me", {
        cookie,
        body: { displayName: "Same" },
      }),
    );

    expect(response.status).toBe(200);
    expect((await userRow(user.id))?.updatedAt).toEqual(user.updatedAt);
  });
});

/** A store that keeps photos on disk like the local one, but cannot remove them. */
function storeThatCannotRemove(): AvatarStore {
  const disk = testApp.avatars;
  return {
    directory: disk.directory,
    save: (name, webp) => disk.save(name, webp),
    remove: async () => {
      throw new Error("the disk is read-only");
    },
  };
}

describe("U3 PUT /api/v1/me/avatar", () => {
  const upload = (cookie: string, body: FormData, target = app) =>
    target.handle(apiRequest("PUT", "/api/v1/me/avatar", { cookie, body }));

  test("stores the photo as a 512×512 WebP that U9 serves", async () => {
    const { user, cookie } = await signedInUser();

    const response = await upload(cookie, photoForm(await testPng(40)));

    expect(response.status).toBe(200);
    const { avatarUrl } = (await response.json()) as { avatarUrl: string };
    expect(avatarUrl).toMatch(/^\/api\/avatars\/[0-9a-f]{32}\.webp$/);
    expect((await userRow(user.id))?.avatarUrl).toBe(avatarUrl);

    const served = await app.handle(
      new Request(`http://localhost${avatarUrl}`),
    );
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/webp");
    const metadata = await sharp(await served.arrayBuffer()).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 512, height: 512 });
  });

  test("keeps no metadata of the original, such as its EXIF", async () => {
    const { cookie } = await signedInUser();
    const jpeg = await sharp(await testPng(32))
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "Somebody" } } })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();

    const response = await upload(cookie, photoForm(jpeg, "photo.jpg"));

    expect(response.status).toBe(200);
    const { avatarUrl } = (await response.json()) as { avatarUrl: string };
    const served = await app.handle(
      new Request(`http://localhost${avatarUrl}`),
    );
    const metadata = await sharp(await served.arrayBuffer()).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  test("removes the old photo once the new one is in place", async () => {
    const { cookie } = await signedInUser();
    const first = (await (
      await upload(cookie, photoForm(await testPng()))
    ).json()) as { avatarUrl: string };

    const second = await upload(cookie, photoForm(await testPng()));

    expect(second.status).toBe(200);
    const old = await app.handle(
      new Request(`http://localhost${first.avatarUrl}`),
    );
    expect(old.status).toBe(404);
  });

  test("answers and logs when the old photo cannot be removed", async () => {
    const built = buildTestApp(database, { avatars: storeThatCannotRemove() });
    const { cookie } = await signedInUser({}, built.app);
    await upload(cookie, photoForm(await testPng()), built.app);

    const response = await upload(
      cookie,
      photoForm(await testPng()),
      built.app,
    );

    expect(response.status).toBe(200);
    const line = built.lines.find(
      (entry) => entry.message === "photo removal failed",
    );
    expect(line).toMatchObject({
      severity: "ERROR",
      errorMessage: "the disk is read-only",
    });
  });

  test("answers 503 and keeps the photo it had when the store does not take the new one", async () => {
    const disk = testApp.avatars;
    let down = false;
    const built = buildTestApp(database, {
      avatars: {
        directory: disk.directory,
        save: async (name, webp) => {
          if (down) {
            throw new ApiError(
              "UPSTREAM_UNAVAILABLE",
              "Cloud Storage did not take the photo",
            );
          }
          return disk.save(name, webp);
        },
        remove: (url) => disk.remove(url),
      },
    });
    const { user, cookie } = await signedInUser({}, built.app);
    const first = (await (
      await upload(cookie, photoForm(await testPng()), built.app)
    ).json()) as { avatarUrl: string };
    down = true;

    const response = await upload(
      cookie,
      photoForm(await testPng()),
      built.app,
    );

    expect(response.status).toBe(503);
    expect((await errorOf(response)).code).toBe("UPSTREAM_UNAVAILABLE");
    expect((await userRow(user.id))?.avatarUrl).toBe(first.avatarUrl);
    const kept = await app.handle(
      new Request(`http://localhost${first.avatarUrl}`),
    );
    expect(kept.status).toBe(200);
  });

  test("removes the new file when the account is deleted before it is set", async () => {
    const { user, cookie } = await signedInUser();
    const saved: string[] = [];
    const disk = testApp.avatars;
    const built = buildTestApp(database, {
      avatars: {
        directory: disk.directory,
        save: async (name, webp) => {
          const url = await disk.save(name, webp);
          saved.push(url);
          return url;
        },
        remove: (url) => disk.remove(url),
      },
    });
    const photo = photoForm(await testPng());

    const response = await duringAccountDeletion(db, user.id, () =>
      upload(cookie, photo, built.app),
    );

    expect(response.status).toBe(401);
    expect((await userRow(user.id))?.avatarUrl).toBeNull();
    expect(saved).toHaveLength(1);
    const left = await app.handle(new Request(`http://localhost${saved[0]}`));
    expect(left.status).toBe(404);
  });

  test("answers 400 for a body that is not multipart", async () => {
    const { cookie } = await signedInUser();

    const response = await app.handle(
      new Request("http://localhost/api/v1/me/avatar", {
        method: "PUT",
        headers: {
          "content-type": "multipart/form-data; boundary=nothing",
          "x-forwarded-for": uniqueIp(),
          cookie,
        },
        body: "this is no form",
      }),
    );

    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("BAD_REQUEST");
  });

  test("tells the format from the content, not the name or the declared type", async () => {
    const { cookie } = await signedInUser();
    const gif = await sharp(await testPng())
      .gif()
      .toBuffer();
    for (const bytes of [new TextEncoder().encode("not an image"), gif]) {
      const response = await upload(cookie, photoForm(bytes, "photo.png"));
      expect(response.status).toBe(422);
      const error = await errorOf(response);
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.details?.[0]?.path).toBe("file");
    }
  });

  test("needs a file", async () => {
    const { cookie } = await signedInUser();
    const form = new FormData();
    form.set("file", "not a file");

    const response = await upload(cookie, form);

    expect(response.status).toBe(422);
    expect((await errorOf(response)).details?.[0]?.path).toBe("file");
  });

  test("refuses a photo over 5 MB with 413", async () => {
    const { user, cookie } = await signedInUser();

    const response = await upload(cookie, photoForm(new Uint8Array(5_000_001)));

    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("PAYLOAD_TOO_LARGE");
    expect((await userRow(user.id))?.avatarUrl).toBeNull();
  });

  test("stops reading a body that grows past the limit, whatever its length says", async () => {
    const { cookie } = await signedInUser();
    const chunk = new Uint8Array(1_000_000);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
        if (sent > 20_000_000) controller.close();
      },
    });

    const response = await app.handle(
      new Request("http://localhost/api/v1/me/avatar", {
        method: "PUT",
        headers: {
          "content-type": "multipart/form-data; boundary=x",
          "x-forwarded-for": uniqueIp(),
          cookie,
        },
        body,
      }),
    );

    expect(response.status).toBe(413);
    expect(sent).toBeLessThan(10_000_000);
  });

  test("removes the photo with DELETE", async () => {
    const { user, cookie } = await signedInUser();
    const { avatarUrl } = (await (
      await upload(cookie, photoForm(await testPng()))
    ).json()) as { avatarUrl: string };

    const response = await app.handle(
      apiRequest("DELETE", "/api/v1/me/avatar", { cookie }),
    );

    expect(response.status).toBe(204);
    expect((await userRow(user.id))?.avatarUrl).toBeNull();
    const served = await app.handle(
      new Request(`http://localhost${avatarUrl}`),
    );
    expect(served.status).toBe(404);
  });
});

describe("U9 GET /api/avatars/{name}", () => {
  test("answers 404 for a name outside the pattern and for a missing photo", async () => {
    for (const name of [
      "../secret.webp",
      "ABCDEF0123456789ABCDEF0123456789.webp",
      "0123456789abcdef0123456789abcdef.png",
      `${"0".repeat(32)}.webp`,
    ]) {
      const response = await app.handle(
        new Request(`http://localhost/api/avatars/${encodeURIComponent(name)}`),
      );
      expect(response.status).toBe(404);
    }
  });

  test("is served only where photos live on disk", () => {
    const deployed = buildTestApp(database, {
      avatars: {
        save: async () => "",
        remove: async () => {},
      },
    });
    expect(
      deployed.app.routes.some((route) => route.path === "/api/avatars/:name"),
    ).toBe(false);
  });
});

describe("U8 POST /api/v1/me/password", () => {
  const setPassword = (
    cookie: string,
    newPassword = "a fresh password",
    target = app,
  ) =>
    target.handle(
      apiRequest("POST", "/api/v1/me/password", {
        cookie,
        body: { newPassword },
      }),
    );

  test("gives a Google-only account a password and ends its other sessions", async () => {
    const user = await fixtures.createUser();
    const other = await signIn(app, user.email, uniqueIp());
    const cookie = await signIn(app, user.email, uniqueIp());
    await dropPassword(user.id);

    const response = await setPassword(cookie);

    expect(response.status).toBe(204);
    const me = await app.handle(apiRequest("GET", "/api/v1/me", { cookie }));
    expect(await me.json()).toMatchObject({ hasPassword: true });
    const signedOut = await app.handle(
      apiRequest("GET", "/api/v1/me", { cookie: other }),
    );
    expect(signedOut.status).toBe(401);
    const signedInWithIt = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({
          email: user.email,
          password: "a fresh password",
        }),
      }),
    );
    expect(signedInWithIt.status).toBe(200);
  });

  test("gives a password to a credential account that has none", async () => {
    const user = await fixtures.createUser();
    const cookie = await signIn(app, user.email, uniqueIp());
    await db
      .update(accounts)
      .set({ password: null })
      .where(eq(accounts.userId, user.id));

    const response = await setPassword(cookie, "a password at last");

    expect(response.status).toBe(204);
    const signedInWithIt = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({
          email: user.email,
          password: "a password at last",
        }),
      }),
    );
    expect(signedInWithIt.status).toBe(200);
  });

  test("lets one of two at once through, and the other finds the password set", async () => {
    const user = await fixtures.createUser();
    const cookie = await signIn(app, user.email, uniqueIp());
    await dropPassword(user.id);

    const statuses = await Promise.all(
      ["first password", "second password"].map(
        async (password) => (await setPassword(cookie, password)).status,
      ),
    );

    expect(statuses.sort()).toEqual([204, 409]);
    expect(
      await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, user.id),
            eq(accounts.providerId, "credential"),
          ),
        ),
    ).toHaveLength(1);
  });

  test("refuses an account that has a password", async () => {
    const { cookie } = await signedInUser();

    const response = await setPassword(cookie);

    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("PASSWORD_ALREADY_SET");
  });

  test("asks for a sign-in within the last 10 minutes", async () => {
    const later = buildTestApp(database, {
      now: () => Date.now() + 11 * MINUTE_MS,
    });
    const { user, cookie } = await signedInUser({}, later.app);
    await dropPassword(user.id);

    const response = await setPassword(cookie, undefined, later.app);

    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("REAUTH_REQUIRED");
  });

  test("holds the new password to the rule of design-spec 6.0.8", async () => {
    const { user, cookie } = await signedInUser();
    await dropPassword(user.id);

    const response = await setPassword(cookie, "short");

    expect(response.status).toBe(422);
    expect((await errorOf(response)).details?.[0]?.path).toBe("newPassword");
  });
});

describe("U7 POST /api/v1/me/delete", () => {
  const deleteAccount = (
    cookie: string,
    body: Record<string, unknown>,
    target = app,
  ) => target.handle(apiRequest("POST", "/api/v1/me/delete", { cookie, body }));

  test("checks the address first, ignoring its case", async () => {
    const { user, cookie } = await signedInUser();

    const wrong = await deleteAccount(cookie, {
      confirmEmail: uniqueEmail(),
      password: TEST_PASSWORD,
    });
    expect(wrong.status).toBe(422);
    expect((await errorOf(wrong)).code).toBe("CONFIRMATION_MISMATCH");

    const right = await deleteAccount(cookie, {
      confirmEmail: user.email.toUpperCase(),
      password: TEST_PASSWORD,
    });
    expect(right.status).toBe(204);
  });

  test("needs the password of an account that has one, and limits the tries", async () => {
    const { user, cookie } = await signedInUser();

    const missing = await deleteAccount(cookie, { confirmEmail: user.email });
    expect(missing.status).toBe(422);
    expect((await errorOf(missing)).details?.[0]?.path).toBe("password");

    for (let attempt = 0; attempt < DELETION_PASSWORD_LIMIT.max; attempt++) {
      const wrong = await deleteAccount(cookie, {
        confirmEmail: user.email,
        password: "not the password",
      });
      expect(wrong.status).toBe(403);
      expect((await errorOf(wrong)).code).toBe("INVALID_PASSWORD");
    }
    const limited = await deleteAccount(cookie, {
      confirmEmail: user.email,
      password: TEST_PASSWORD,
    });
    expect(limited.status).toBe(429);
    const error = await errorOf(limited);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
    expect((await userRow(user.id))?.status).toBe("active");
    await db
      .delete(rateLimits)
      .where(
        eq(
          rateLimits.key,
          `app:user:${DELETION_PASSWORD_LIMIT.name}:${user.id}`,
        ),
      );
  });

  test("asks an account without a password for a sign-in within the last 10 minutes", async () => {
    const later = buildTestApp(database, {
      now: () => Date.now() + 11 * MINUTE_MS,
    });
    const stale = await signedInUser({}, later.app);
    await dropPassword(stale.user.id);
    const refused = await deleteAccount(
      stale.cookie,
      { confirmEmail: stale.user.email },
      later.app,
    );
    expect(refused.status).toBe(403);
    expect((await errorOf(refused)).code).toBe("REAUTH_REQUIRED");

    const fresh = await signedInUser();
    await dropPassword(fresh.user.id);
    const deleted = await deleteAccount(fresh.cookie, {
      confirmEmail: fresh.user.email,
    });
    expect(deleted.status).toBe(204);
  });

  test("refuses the only Owner of a workspace with other members", async () => {
    const team = await fixtures.createTeam();
    const cookie = await signIn(app, team.owner.email, uniqueIp());

    const response = await deleteAccount(cookie, {
      confirmEmail: team.owner.email,
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error.code).toBe("LAST_OWNER");
    expect(error.workspaces).toEqual([
      { id: team.workspace.id, name: team.workspace.name },
    ]);
    expect((await userRow(team.owner.id))?.status).toBe("active");
  });

  test("counts the role an Owner gave the user while the deletion waited", async () => {
    const team = await fixtures.createTeam();
    const cookie = await signIn(app, team.member.email, uniqueIp());

    // Holds the members' lock, as the Owner's role change does: it makes the Member an
    // Owner and leaves, so the Member becomes the only Owner of a team.
    const started: { response?: Promise<Response> } = {};
    await db.transaction(async (tx) => {
      await lockMembers(tx, team.workspace.id);
      started.response = deleteAccount(cookie, {
        confirmEmail: team.member.email,
        password: TEST_PASSWORD,
      });
      await untilBlockedBy(db, tx);
      await tx
        .update(memberships)
        .set({ role: "owner" })
        .where(
          and(
            eq(memberships.workspaceId, team.workspace.id),
            eq(memberships.userId, team.member.id),
          ),
        );
      await tx
        .delete(memberships)
        .where(
          and(
            eq(memberships.workspaceId, team.workspace.id),
            eq(memberships.userId, team.owner.id),
          ),
        );
    });
    const response = await started.response;

    expect(response?.status).toBe(409);
    expect(response === undefined ? null : (await errorOf(response)).code).toBe(
      "LAST_OWNER",
    );
    expect((await userRow(team.member.id))?.status).toBe("active");
  });

  test("waits for a write inside the personal workspace it deletes", async () => {
    const { user, cookie } = await signedInUser();
    const personal = await personalWorkspace(user.id);
    const { idea } = await fixtures.createIdea(personal.id, user.id);

    // A save in the idea, as SDD 7.1「実装」 orders it: the idea first, the workspace's
    // last activity at the end. Deleting the workspace row before the idea deadlocked.
    const started: { response?: Promise<Response> } = {};
    await db.transaction(async (tx) => {
      await tx
        .select({ id: ideas.id })
        .from(ideas)
        .where(eq(ideas.id, idea.id))
        .for("no key update");
      started.response = deleteAccount(cookie, {
        confirmEmail: user.email,
        password: TEST_PASSWORD,
      });
      await untilBlockedBy(db, tx);
      await tx
        .update(workspaces)
        .set({ lastActiveAt: new Date() })
        .where(eq(workspaces.id, personal.id));
    });
    const response = await started.response;

    expect(response?.status).toBe(204);
    expect(
      await db.select().from(workspaces).where(eq(workspaces.id, personal.id)),
    ).toEqual([]);
  });

  test("refuses a second deletion of the same account", async () => {
    const { user, cookie } = await signedInUser();
    const body = { confirmEmail: user.email, password: TEST_PASSWORD };

    const statuses = await Promise.all(
      [0, 1].map(async () => (await deleteAccount(cookie, body)).status),
    );

    // The second waits for the first and finds the account gone.
    expect(statuses.sort()).toEqual([204, 401]);
  });

  test("replaces the personal data, ends the sessions and clears the cookie", async () => {
    const { user, cookie } = await signedInUser();
    const photo = await app.handle(
      apiRequest("PUT", "/api/v1/me/avatar", {
        cookie,
        body: photoForm(await testPng()),
      }),
    );
    const { avatarUrl } = (await photo.json()) as { avatarUrl: string };
    await db.insert(verifications).values({
      identifier: "reset-password:some-token",
      value: user.id,
      expiresAt: new Date(Date.now() + MINUTE_MS),
    });

    const response = await deleteAccount(cookie, {
      confirmEmail: user.email,
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(204);
    expect(
      response.headers
        .getSetCookie()
        .some((line) => /^moonx\.session_token=;/.test(line)),
    ).toBe(true);
    expect(await userRow(user.id)).toMatchObject({
      email: `deleted+${user.id}@deleted.invalid`,
      displayName: DELETED_USER_NAME,
      avatarUrl: null,
      status: "deleted",
      lastWorkspaceId: null,
    });
    expect(
      await db.select().from(sessions).where(eq(sessions.userId, user.id)),
    ).toEqual([]);
    expect(
      await db.select().from(accounts).where(eq(accounts.userId, user.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(verifications)
        .where(eq(verifications.value, user.id)),
    ).toEqual([]);
    const served = await app.handle(
      new Request(`http://localhost${avatarUrl}`),
    );
    expect(served.status).toBe(404);
    const after = await app.handle(apiRequest("GET", "/api/v1/me", { cookie }));
    expect(after.status).toBe(401);
    const signInAgain = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ email: user.email, password: TEST_PASSWORD }),
      }),
    );
    expect(signInAgain.status).toBe(401);
  });

  test("deletes a personal workspace nobody else is in, with what is inside", async () => {
    const { user, cookie } = await signedInUser();
    const personal = await personalWorkspace(user.id);
    const { idea } = await fixtures.createIdea(personal.id, user.id);
    await fixtures.createPlan(idea.id, user.id);

    const response = await deleteAccount(cookie, {
      confirmEmail: user.email,
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(204);
    expect(
      await db.select().from(workspaces).where(eq(workspaces.id, personal.id)),
    ).toEqual([]);
    expect(await db.select().from(ideas).where(eq(ideas.id, idea.id))).toEqual(
      [],
    );
  });

  test("leaves the team workspaces, keeping the records under Deleted user", async () => {
    const team = await fixtures.createTeam();
    const { user, cookie } = await signedInUser({ displayName: "Leaving" });
    await fixtures.addMember(team.workspace.id, user.id, "member");
    // Someone else owns the personal workspace too, so the user is not its last Owner.
    const personal = await personalWorkspace(user.id);
    await fixtures.addMember(personal.id, team.member.id, "owner");
    const alone = await fixtures.createWorkspace({ createdById: user.id });
    await fixtures.addMember(alone.id, user.id, "owner");
    const { idea } = await fixtures.createIdea(team.workspace.id, user.id);
    const plan = await fixtures.createPlan(idea.id, user.id);
    const [item] = await db
      .insert(executionItems)
      .values({
        businessPlanId: plan.id,
        type: "next_action",
        title: "Call the supplier",
        assigneeUserId: user.id,
        status: "todo",
        sortOrder: 0,
      })
      .returning();
    const [comment] = await db
      .insert(comments)
      .values({
        workspaceId: team.workspace.id,
        containerType: "idea",
        containerId: idea.id,
        targetType: "idea",
        targetId: idea.id,
        authorId: user.id,
        body: "Mine",
      })
      .returning();

    const response = await deleteAccount(cookie, {
      confirmEmail: user.email,
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(204);
    const left = await db
      .select({ workspaceId: memberships.workspaceId })
      .from(memberships)
      .where(eq(memberships.userId, user.id));
    expect(left).toEqual([]);
    // Someone else is in the personal workspace, and the team one stays as a record.
    expect(
      (await db.select().from(workspaces).where(eq(workspaces.id, personal.id)))
        .length,
    ).toBe(1);
    expect(
      (await db.select().from(workspaces).where(eq(workspaces.id, alone.id)))
        .length,
    ).toBe(1);
    const [assigned] = await db
      .select()
      .from(executionItems)
      .where(eq(executionItems.id, item?.id ?? ""));
    expect(assigned).toMatchObject({
      assigneeUserId: null,
      assigneeName: DELETED_USER_NAME,
    });
    const [history] = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.targetId, item?.id ?? ""));
    expect(history).toMatchObject({
      source: "manual",
      action: "update",
      changedById: user.id,
      containerType: "business_plan",
      containerId: plan.id,
    });
    expect(
      (
        await db
          .select()
          .from(comments)
          .where(eq(comments.id, comment?.id ?? ""))
      ).length,
    ).toBe(1);
    expect(
      (await db.select().from(ideas).where(eq(ideas.id, idea.id)))[0]
        ?.proposerId,
    ).toBe(user.id);
    // Leaving changes the team's members, which is activity (SDD 7.1「実装」).
    const [teamRow] = await db
      .select({ lastActiveAt: workspaces.lastActiveAt })
      .from(workspaces)
      .where(eq(workspaces.id, team.workspace.id));
    expect(teamRow?.lastActiveAt).not.toBeNull();
  });

  test("deletes the self-analysis, its comments and history, and the notifications", async () => {
    const team = await fixtures.createTeam();
    const { user, cookie } = await signedInUser();
    await fixtures.addMember(team.workspace.id, user.id, "member");
    const analysis = await fixtures.createSelfAnalysis(user.id, [
      team.workspace.id,
    ]);
    const [comment] = await db
      .insert(comments)
      .values({
        workspaceId: team.workspace.id,
        containerType: "self_analysis",
        containerId: analysis.id,
        sectionKey: "WHY",
        targetType: "self_analysis_answer",
        targetId: analysis.id,
        targetKey: "SA.WHY.1",
        authorId: team.owner.id,
        body: "Nice",
      })
      .returning();
    await db.insert(changeHistory).values({
      ownerUserId: user.id,
      containerType: "self_analysis",
      containerId: analysis.id,
      sectionKey: "WHY",
      targetType: "self_analysis_answer",
      targetId: analysis.id,
      targetKey: "SA.WHY.1",
      action: "update",
      before: null,
      after: { text: "Because" },
      source: "manual",
      changedById: user.id,
    });
    await db.insert(notifications).values({
      userId: user.id,
      workspaceId: team.workspace.id,
      kind: "comment",
      actorId: team.owner.id,
      commentId: comment?.id,
      link: { screen: 11 },
    });

    const response = await deleteAccount(cookie, {
      confirmEmail: user.email,
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(204);
    expect(
      await db
        .select()
        .from(selfAnalyses)
        .where(eq(selfAnalyses.userId, user.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(comments)
        .where(eq(comments.targetId, analysis.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(changeHistory)
        .where(eq(changeHistory.containerId, analysis.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.id)),
    ).toEqual([]);
  });

  test("revokes the valid invitations the user sent and leaves the others", async () => {
    const team = await fixtures.createTeam();
    const { user, cookie } = await signedInUser();
    await fixtures.addMember(team.workspace.id, user.id, "owner");
    const valid = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
      invitedById: user.id,
    });
    const expired = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
      invitedById: user.id,
      expiresAt: new Date(Date.now() - MINUTE_MS),
    });
    const others = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
      invitedById: team.owner.id,
    });

    const response = await deleteAccount(cookie, {
      confirmEmail: user.email,
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(204);
    const statusOf = async (id: string) =>
      (await db.select().from(invitations).where(eq(invitations.id, id)))[0]
        ?.status;
    expect(await statusOf(valid.id)).toBe("revoked");
    expect(await statusOf(expired.id)).toBe("pending");
    expect(await statusOf(others.id)).toBe("pending");
  });

  test("takes the user off the member lists", async () => {
    const team = await fixtures.createTeam();
    const { user, cookie } = await signedInUser({ displayName: "Gone" });
    await fixtures.addMember(team.workspace.id, user.id, "member");

    await deleteAccount(cookie, {
      confirmEmail: user.email,
      password: TEST_PASSWORD,
    });

    const ownerCookie = await signIn(app, team.owner.email, uniqueIp());
    const listed = await app.handle(
      apiRequest("GET", `/api/v1/workspaces/${team.workspace.id}/members`, {
        cookie: ownerCookie,
      }),
    );
    const { items } = (await listed.json()) as {
      items: { user: { id: string } }[];
    };
    expect(items.map((member) => member.user.id)).not.toContain(user.id);
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, user.id), eq(users.status, "deleted")));
    expect(row?.displayName).toBe(DELETED_USER_NAME);
  });
});
