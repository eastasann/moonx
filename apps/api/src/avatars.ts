import { randomBytes } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  avatarNameParamsSchema,
  errorBodySchema,
  PHOTO_MAX_BYTES,
} from "@moonx/schemas";
import { Elysia } from "elysia";
import sharp from "sharp";
import type { AccessPlugin } from "./access";
import { checkDeclaredLength, readBodyWithin } from "./body";
import { ApiError } from "./errors";

/** Where profile photos are kept (ADR-024). */
export interface AvatarStore {
  /** Saves a photo under `name` and returns the URL `users.avatar_url` holds. */
  save(name: string, webp: Uint8Array): Promise<string>;
  /**
   * Removes the photo at `url`. A URL this store did not give is left alone, and a photo
   * that is already gone is no failure.
   */
  remove(url: string): Promise<void>;
  /** Set for the local store, whose files U9 serves; unset for Cloud Storage. */
  readonly directory?: string;
}

/** 32 hex digits and `.webp` (SDD 5.4 U9): random, so nobody can guess a URL. */
const AVATAR_NAME = /^[0-9a-f]{32}\.webp$/;

/** A new photo's file name. */
export const newAvatarName = () => `${randomBytes(16).toString("hex")}.webp`;

const LOCAL_PATH = "/api/avatars/";

/**
 * The store `local` uses (ADR-024): files in `directory`, served by U9. Its URLs are
 * paths, which the Web opens on its own origin through Vite's forward to the API.
 */
export function createDiskAvatarStore(directory: string): AvatarStore {
  return {
    directory,
    async save(name, webp) {
      await mkdir(directory, { recursive: true });
      await Bun.write(join(directory, name), webp);
      return `${LOCAL_PATH}${name}`;
    },
    async remove(url) {
      const name = url.startsWith(LOCAL_PATH)
        ? url.slice(LOCAL_PATH.length)
        : "";
      if (!AVATAR_NAME.test(name)) return;
      await unlink(join(directory, name)).catch((error: unknown) => {
        if ((error as { code?: unknown }).code !== "ENOENT") throw error;
      });
    },
  };
}

/** Where browsers open a public object; the CSP of SDD 7.2 allows images from here. */
const PUBLIC_URL = "https://storage.googleapis.com";
/** Cloud Run's metadata server gives the service account's access token. */
const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
// A request that hangs would hold the caller's response until Cloud Run's own timeout.
const STORAGE_TIMEOUT_MS = 10_000;
/** A token is renewed this long before it expires, so none expires mid-request. */
const TOKEN_MARGIN_MS = 60_000;

/** The Cloud Storage store and, for tests, the endpoints it calls. */
export interface CloudStorageOptions {
  bucket: string;
  /** Cloud Storage's JSON API. Tests point it at their own server. */
  apiUrl?: string;
  /** Where the access token comes from. Tests point it at their own server. */
  tokenUrl?: string;
  now?: () => number;
}

const unavailable = (what: string, cause: unknown) =>
  new ApiError(
    "UPSTREAM_UNAVAILABLE",
    `Cloud Storage did not ${what}`,
    {},
    { cause: cause instanceof Error ? cause : new Error(String(cause)) },
  );

/**
 * The store of staging and production (ADR-024): objects in the public bucket
 * `bucket`, written through Cloud Storage's JSON API with the Cloud Run service
 * account's token. Talking to the API directly, as the mailer does to Resend, keeps
 * Google's client library and its dependencies out of the image for two calls.
 *
 * @throws {ApiError} UPSTREAM_UNAVAILABLE from `save` and `remove` when Cloud Storage
 * or the metadata server does not answer as expected
 */
export function createCloudStorageAvatarStore({
  bucket,
  apiUrl = PUBLIC_URL,
  tokenUrl = METADATA_TOKEN_URL,
  now = Date.now,
}: CloudStorageOptions): AvatarStore {
  let cached: { token: string; expiresAt: number } | undefined;
  const objectsPrefix = `${PUBLIC_URL}/${bucket}/`;

  const accessToken = async (): Promise<string> => {
    if (cached !== undefined && cached.expiresAt - TOKEN_MARGIN_MS > now()) {
      return cached.token;
    }
    const response = await fetch(tokenUrl, {
      headers: { "metadata-flavor": "Google" },
      signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`The metadata server answered ${response.status}`);
    }
    const body = (await response.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (
      typeof body.access_token !== "string" ||
      typeof body.expires_in !== "number"
    ) {
      throw new Error("The metadata server gave no access token");
    }
    cached = {
      token: body.access_token,
      expiresAt: now() + body.expires_in * 1000,
    };
    return cached.token;
  };

  const call = async (url: string, init: RequestInit): Promise<Response> =>
    fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${await accessToken()}`,
      },
      signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
    });

  return {
    async save(name, webp) {
      const url = new URL(
        `/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`,
        apiUrl,
      );
      url.searchParams.set("uploadType", "media");
      url.searchParams.set("name", name);
      let response: Response;
      try {
        response = await call(url.href, {
          method: "POST",
          headers: { "content-type": "image/webp" },
          body: webp,
        });
      } catch (error) {
        throw unavailable("take the photo", error);
      }
      if (!response.ok) {
        throw unavailable(
          "take the photo",
          new Error(`Cloud Storage answered ${response.status}`),
        );
      }
      return `${objectsPrefix}${name}`;
    },
    async remove(photoUrl) {
      const name = photoUrl.startsWith(objectsPrefix)
        ? photoUrl.slice(objectsPrefix.length)
        : "";
      if (!AVATAR_NAME.test(name)) return;
      let response: Response;
      try {
        response = await call(
          new URL(
            `/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}`,
            apiUrl,
          ).href,
          { method: "DELETE" },
        );
      } catch (error) {
        throw unavailable("remove the photo", error);
      }
      if (!response.ok && response.status !== 404) {
        throw unavailable(
          "remove the photo",
          new Error(`Cloud Storage answered ${response.status}`),
        );
      }
    },
  };
}

/**
 * Room for the multipart framing around the photo (boundary lines and part headers),
 * so a photo just under the limit of design-spec 6.0.8 still fits in the body.
 */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * The parser of U3: reads the `multipart/form-data` body without letting it grow past
 * the photo limit and its framing, whatever `Content-Length` says (SDD 8.1 の 413).
 * Returns the form's `file` field for the body schema to check.
 *
 * @throws {ApiError} PAYLOAD_TOO_LARGE when the body or the photo is too large,
 * BAD_REQUEST when the body is not multipart
 */
export async function readAvatarUpload({
  request,
}: {
  request: Request;
}): Promise<{ file: string | File | undefined }> {
  const maxBytes = PHOTO_MAX_BYTES + MULTIPART_OVERHEAD_BYTES;
  checkDeclaredLength(request, maxBytes);
  const bytes = await readBodyWithin(request.body, maxBytes, request.signal);
  let form: Awaited<ReturnType<Response["formData"]>>;
  try {
    form = await new Response(bytes, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    throw new ApiError("BAD_REQUEST", "The body is not multipart/form-data");
  }
  const file = form.get("file") ?? undefined;
  if (file instanceof File && file.size > PHOTO_MAX_BYTES) {
    throw new ApiError(
      "PAYLOAD_TOO_LARGE",
      `The photo is larger than ${PHOTO_MAX_BYTES} bytes`,
    );
  }
  return { file };
}

/** sharp's names for the formats of design-spec 6.0.8 (JPEG, PNG, WebP). */
const PHOTO_FORMATS = new Set(["jpeg", "png", "webp"]);
/** The side of the stored square (ADR-024). */
const AVATAR_SIDE = 512;

const notAPhoto = (cause?: unknown) =>
  new ApiError(
    "VALIDATION_FAILED",
    "The file is not a JPEG, PNG or WebP image",
    {
      details: [
        {
          path: "file",
          code: "invalid_format",
          message: "Must be a JPEG, PNG or WebP image",
        },
      ],
    },
    cause === undefined
      ? undefined
      : { cause: cause instanceof Error ? cause : new Error(String(cause)) },
  );

/**
 * The photo as stored (ADR-024, SDD 7.2「アップロード」): its format told from the bytes,
 * never from the name or the declared type; turned upright by its EXIF orientation;
 * cropped from the centre to a 512×512 square; WebP, without the location and other
 * metadata (sharp writes none unless asked).
 *
 * @throws {ApiError} VALIDATION_FAILED on `file` when the bytes are not a JPEG, PNG or
 * WebP image sharp can read
 */
export async function toAvatar(bytes: Uint8Array): Promise<Uint8Array> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(bytes).metadata());
  } catch (error) {
    throw notAPhoto(error);
  }
  if (format === undefined || !PHOTO_FORMATS.has(format)) throw notAPhoto();
  try {
    return await sharp(bytes)
      .rotate()
      .resize(AVATAR_SIDE, AVATAR_SIDE, { fit: "cover" })
      .webp()
      .toBuffer();
  } catch (error) {
    throw notAPhoto(error);
  }
}

const noPhoto = () => new ApiError("NOT_FOUND", "No such photo");

/**
 * U9 `GET /api/avatars/{name}` (SDD 5.4): the local store's photos. Only `local` serves
 * it; elsewhere browsers open the Cloud Storage URL.
 */
export function avatarFileRoutes(access: AccessPlugin, directory: string) {
  return new Elysia().use(access).get(
    "/api/avatars/:name",
    async ({ params }) => {
      if (!AVATAR_NAME.test(params.name)) throw noPhoto();
      const file = Bun.file(join(directory, params.name));
      if (!(await file.exists())) throw noPhoto();
      return new Response(file, { headers: { "content-type": "image/webp" } });
    },
    {
      open: true,
      params: avatarNameParamsSchema,
      response: { 404: errorBodySchema },
      detail: {
        summary: "U9 A profile photo (local only)",
        description:
          "Public. Only where photos are kept on disk; deployed environments link to Cloud Storage instead.",
      },
    },
  );
}
