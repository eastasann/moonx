import type { Me } from "@moonx/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, call } from "./api";
import { ApiError } from "./api-error";
import { ME_KEY } from "./session";

/** The picture types U3 accepts, and the 5 MB limit it enforces (SDD 5.4). */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Checks a chosen file before it is sent, with the same error codes the API answers with. */
export function checkPhoto(file: File): ApiError | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return new ApiError("VALIDATION_FAILED", 422, "Not a JPEG, PNG or WebP picture");
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return new ApiError("PAYLOAD_TOO_LARGE", 413, "The photo is larger than 5 MB");
  }
  return null;
}

/** U3: upload the profile photo, or remove it. The account in the cache follows the answer. */
export function usePhotoUpload() {
  const queryClient = useQueryClient();
  const setPhoto = (avatarUrl: string | null) =>
    queryClient.setQueryData<Me>(ME_KEY, (me) => (me ? { ...me, avatarUrl } : me));

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const refusal = checkPhoto(file);
      if (refusal) throw refusal;
      return call(api().api.v1.me.avatar.put({ file }));
    },
    onSuccess: ({ avatarUrl }) => setPhoto(avatarUrl),
  });
  const remove = useMutation({
    mutationFn: () => call(api().api.v1.me.avatar.delete()),
    onSuccess: () => setPhoto(null),
  });
  return { upload, remove, photoError: upload.error ?? remove.error };
}
