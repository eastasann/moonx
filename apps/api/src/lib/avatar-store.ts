import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import type { AppConfig } from "../config";

/** Where profile photos live (ADR-024). Names are random, so a URL cannot be guessed. */
export interface AvatarStore {
  /** Stores a WebP image and returns the public URL. */
  put(image: Uint8Array): Promise<string>;
  /** Deletes the photo behind a URL this store gave out; unknown URLs are ignored. */
  remove(url: string): Promise<void>;
  /** The bytes of a locally stored photo, for the local-only file route; null elsewhere. */
  readLocal?(name: string): Promise<Blob | null>;
}

const NAME_PATTERN = /^[0-9a-f]{32}\.webp$/;
const newName = () => `${randomBytes(16).toString("hex")}.webp`;
const nameOf = (url: string) => url.split("/").pop() ?? "";

/** Photos on disk, served by the API itself. Only local and test use it. */
export function createLocalAvatarStore(dir: string, publicUrl: string): AvatarStore {
  const base = `${publicUrl}/api/avatars/`;
  return {
    async put(image) {
      const name = newName();
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name), image);
      return `${base}${name}`;
    },
    async remove(url) {
      const name = nameOf(url);
      if (url.startsWith(base) && NAME_PATTERN.test(name)) {
        await rm(join(dir, name), { force: true });
      }
    },
    async readLocal(name) {
      if (!NAME_PATTERN.test(name)) return null;
      const file = Bun.file(join(dir, name));
      return (await file.exists()) ? file : null;
    },
  };
}

/** Photos in the public-read bucket `moonx-{env}-avatars` (credentials come from the runtime). */
export function createGcsAvatarStore(
  bucketName: string,
  storage: Pick<Storage, "bucket"> = new Storage(),
): AvatarStore {
  const bucket = storage.bucket(bucketName);
  const base = `https://storage.googleapis.com/${bucketName}/`;
  return {
    async put(image) {
      const name = newName();
      await bucket.file(name).save(Buffer.from(image), {
        contentType: "image/webp",
        resumable: false,
        metadata: { cacheControl: "public, max-age=31536000, immutable" },
      });
      return `${base}${name}`;
    },
    async remove(url) {
      if (!url.startsWith(base)) return;
      const name = nameOf(url);
      if (NAME_PATTERN.test(name)) await bucket.file(name).delete({ ignoreNotFound: true });
    },
  };
}

/** The store the configuration asks for: the bucket when `AVATAR_BUCKET` is set, else the disk. */
export function createAvatarStore(config: AppConfig): AvatarStore {
  return config.avatarBucket
    ? createGcsAvatarStore(config.avatarBucket)
    : createLocalAvatarStore("./.data/avatars", config.publicUrl);
}
