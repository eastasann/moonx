import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  createCloudStorageAvatarStore,
  createDiskAvatarStore,
  newAvatarName,
  toAvatar,
} from "./avatars";
import { ApiError } from "./errors";
import { testPng } from "./test-fixtures";

interface Seen {
  method: string;
  path: string;
  search: string;
  headers: Record<string, string>;
  bytes: number;
}

/**
 * Stands in for Cloud Run's metadata server and Cloud Storage's JSON API. `status`
 * decides each answer of the storage API.
 */
function fakeGoogle(status: (request: Request) => number = () => 200) {
  const seen: Seen[] = [];
  let tokens = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      seen.push({
        method: request.method,
        path: url.pathname,
        search: url.search,
        headers: Object.fromEntries(request.headers),
        bytes: (await request.arrayBuffer()).byteLength,
      });
      if (url.pathname === "/token") {
        tokens++;
        return Response.json({
          access_token: `token-${tokens}`,
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      return new Response(null, { status: status(request) });
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  return {
    seen,
    tokens: () => tokens,
    store: (now?: () => number) =>
      createCloudStorageAvatarStore({
        bucket: "proj-moonx-staging-avatars",
        apiUrl: base,
        tokenUrl: `${base}/token`,
        now,
      }),
    stop: () => server.stop(true),
  };
}

describe("the Cloud Storage store", () => {
  /** A photo the fake bucket no longer has. */
  const MISSING = `${"f".repeat(32)}.webp`;
  const google = fakeGoogle((request) =>
    new URL(request.url).pathname.endsWith(`/${MISSING}`) ? 404 : 200,
  );
  afterAll(() => google.stop());

  test("uploads the WebP with the service account's token and answers the public URL", async () => {
    const name = newAvatarName();

    const url = await google.store().save(name, new Uint8Array([1, 2, 3]));

    expect(url).toBe(
      `https://storage.googleapis.com/proj-moonx-staging-avatars/${name}`,
    );
    const [token, upload] = google.seen.slice(-2);
    expect(token?.headers["metadata-flavor"]).toBe("Google");
    expect(upload).toMatchObject({
      method: "POST",
      path: "/upload/storage/v1/b/proj-moonx-staging-avatars/o",
      search: `?uploadType=media&name=${name}`,
      bytes: 3,
    });
    expect(upload?.headers).toMatchObject({
      authorization: expect.stringMatching(/^Bearer token-\d+$/),
      "content-type": "image/webp",
    });
  });

  test("keeps the token until a minute before it expires", async () => {
    let clock = Date.now();
    const store = google.store(() => clock);
    const before = google.tokens();

    await store.save(newAvatarName(), new Uint8Array([1]));
    await store.save(newAvatarName(), new Uint8Array([1]));
    expect(google.tokens()).toBe(before + 1);

    clock += 3600 * 1000 - 59_000;
    await store.save(newAvatarName(), new Uint8Array([1]));
    expect(google.tokens()).toBe(before + 2);
  });

  test("deletes its own objects, a missing one included, and leaves other URLs alone", async () => {
    const store = google.store();
    const name = newAvatarName();
    const count = google.seen.length;

    await store.remove(
      `https://storage.googleapis.com/proj-moonx-staging-avatars/${name}`,
    );
    await store.remove(
      `https://storage.googleapis.com/proj-moonx-staging-avatars/${MISSING}`,
    );
    await store.remove("https://example.com/photo.webp");
    await store.remove(
      "https://storage.googleapis.com/another-bucket/0123456789abcdef0123456789abcdef.webp",
    );
    await store.remove("/api/avatars/0123456789abcdef0123456789abcdef.webp");

    const calls = google.seen
      .slice(count)
      .filter((call) => call.path !== "/token");
    expect(calls).toEqual([
      expect.objectContaining({
        method: "DELETE",
        path: `/storage/v1/b/proj-moonx-staging-avatars/o/${name}`,
      }),
      expect.objectContaining({
        method: "DELETE",
        path: `/storage/v1/b/proj-moonx-staging-avatars/o/${MISSING}`,
      }),
    ]);
  });

  test("fails as UPSTREAM_UNAVAILABLE when Cloud Storage or the token fails", async () => {
    const down = fakeGoogle(() => 503);
    try {
      const error = await down
        .store()
        .save(newAvatarName(), new Uint8Array([1]))
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("UPSTREAM_UNAVAILABLE");
      const removal = await down
        .store()
        .remove(
          `https://storage.googleapis.com/proj-moonx-staging-avatars/${newAvatarName()}`,
        )
        .catch((caught: unknown) => caught);
      expect((removal as ApiError).code).toBe("UPSTREAM_UNAVAILABLE");
    } finally {
      down.stop();
    }
    const noToken = createCloudStorageAvatarStore({
      bucket: "b",
      apiUrl: "http://127.0.0.1:1",
      tokenUrl: "http://127.0.0.1:1/token",
    });
    const error = await noToken
      .save(newAvatarName(), new Uint8Array([1]))
      .catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("UPSTREAM_UNAVAILABLE");
  });
});

describe("the disk store", () => {
  test("keeps photos under its directory and serves them as paths", async () => {
    const directory = join(mkdtempSync(join(tmpdir(), "moonx-")), "avatars");
    const store = createDiskAvatarStore(directory);
    const name = newAvatarName();

    const url = await store.save(name, new Uint8Array([1]));

    expect(url).toBe(`/api/avatars/${name}`);
    expect(readdirSync(directory)).toEqual([name]);
    await store.remove("/api/avatars/../../etc/passwd");
    await store.remove(`https://storage.googleapis.com/bucket/${name}`);
    expect(readdirSync(directory)).toEqual([name]);
    await store.remove(url);
    await store.remove(url);
    expect(readdirSync(directory)).toEqual([]);
  });
});

describe("toAvatar", () => {
  test("crops any accepted photo to a 512×512 WebP from its centre", async () => {
    const wide = await sharp({
      create: {
        width: 300,
        height: 100,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();
    for (const input of [wide, await testPng(10)]) {
      const output = await toAvatar(input);
      expect(await sharp(output).metadata()).toMatchObject({
        format: "webp",
        width: 512,
        height: 512,
      });
    }
  });

  test("turns a photo upright by its EXIF orientation", async () => {
    // Left half black, right half white, stored rotated: orientation 6 says the
    // camera was turned, so upright the black half is on top.
    const half = { width: 100, height: 200, channels: 3 } as const;
    const stored = await sharp({
      create: { ...half, width: 200, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: await sharp({
            create: { ...half, background: { r: 0, g: 0, b: 0 } },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const output = await toAvatar(stored);

    const { data } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => data[(y * 512 + x) * 3] ?? -1;
    expect(pixel(256, 20)).toBeLessThan(64);
    expect(pixel(256, 490)).toBeGreaterThan(192);
  });

  test("refuses what is not a JPEG, PNG or WebP image", async () => {
    const gif = await sharp(await testPng())
      .gif()
      .toBuffer();
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );
    const truncated = (await testPng(64)).subarray(0, 40);
    for (const input of [new Uint8Array([1, 2, 3]), gif, svg, truncated]) {
      const error = await toAvatar(input).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("VALIDATION_FAILED");
    }
  });
});
