import sharp from "sharp";
import { ApiError, validationFailed } from "../errors";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_SIZE = 512;
const ACCEPTED = new Set(["jpeg", "png", "webp"]);
/** Refuses decompression bombs: a small file can declare an enormous canvas. */
const MAX_INPUT_PIXELS = 40_000_000;

const notAnImage = () =>
  validationFailed([
    { path: "file", code: "invalid_type", message: "Must be a JPEG, PNG or WebP image" },
  ]);

/**
 * Turns an upload into the stored photo: 512x512 WebP, cropped to fill. The type is read from
 * the bytes, not from the name or the declared content type (SDD 7.2). sharp drops metadata
 * such as GPS position unless asked to keep it, and `rotate()` applies the EXIF orientation
 * before that data is gone.
 */
export async function toAvatarWebp(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const input = () => sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
    const { format } = await input().metadata();
    if (!format || !ACCEPTED.has(format)) throw notAnImage();
    return await input()
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
      .webp()
      .toBuffer();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw notAnImage();
  }
}
