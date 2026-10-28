import { type Me, PHOTO_MAX_BYTES, PHOTO_TYPES } from "@moonx/schemas";
import {
  Avatar,
  Button,
  FileTrigger,
  Flex,
  InlineAlert,
  Stack,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, unwrap } from "../lib/api";
import { useIsOnline } from "../lib/online";
import { meQuery } from "../lib/queries";
import { isSessionLost, useSendThrough } from "../lib/send";
import { failureCode, SendFailure } from "./SendFailure";

/** What failed, and how to send it again with Retry. */
type PhotoFailure =
  | { error: unknown; file: File }
  | { error: unknown; file: null };

/**
 * The profile photo (U3), saved as soon as it is chosen (design-spec 6.16 3・4): JPEG, PNG
 * or WebP up to 5 MB (6.0.8), checked here for its size before it is sent and by the API
 * for what it is. 4 can also remove it (U3 DELETE), leaving the initials.
 */
export function PhotoField({
  me,
  canRemove = false,
}: {
  me: Me;
  canRemove?: boolean;
}) {
  const { t } = useTranslation(["auth"]);
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const sendThrough = useSendThrough();
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const [failure, setFailure] = useState<PhotoFailure | null>(null);
  const [problem, setProblem] = useState<"tooLarge" | "format" | null>(null);
  const putAvatar = (avatarUrl: string | null) =>
    queryClient.setQueryData(meQuery().queryKey, (previous: Me | undefined) =>
      previous === undefined ? previous : { ...previous, avatarUrl },
    );
  const upload = async (file: File) => {
    setFailure(null);
    setProblem(null);
    if (file.size > PHOTO_MAX_BYTES) {
      setProblem("tooLarge");
      return;
    }
    setPending("upload");
    try {
      const { avatarUrl } = await sendThrough(() =>
        unwrap(api().api.v1.me.avatar.put({ file })),
      );
      putAvatar(avatarUrl);
    } catch (cause) {
      const code = failureCode(cause);
      if (isSessionLost(cause)) return;
      if (code === "PAYLOAD_TOO_LARGE") setProblem("tooLarge");
      else if (code === "VALIDATION_FAILED") setProblem("format");
      else setFailure({ error: cause, file });
    } finally {
      setPending(null);
    }
  };
  const remove = async () => {
    setFailure(null);
    setProblem(null);
    setPending("remove");
    try {
      await sendThrough(() => unwrap(api().api.v1.me.avatar.delete()));
      putAvatar(null);
    } catch (cause) {
      if (!isSessionLost(cause)) setFailure({ error: cause, file: null });
    } finally {
      setPending(null);
    }
  };
  const retry = (last: PhotoFailure) =>
    void (last.file === null ? remove() : upload(last.file));
  return (
    <Stack gap="space-200">
      <Flex gap="space-300" alignItems="center" wrap>
        <Avatar name={me.displayName} src={me.avatarUrl} size="M" />
        <FileTrigger
          acceptedFileTypes={[...PHOTO_TYPES]}
          onSelect={(files) => {
            const file = files?.[0];
            if (file !== undefined) void upload(file);
          }}
        >
          <Button
            variant="secondary"
            isPending={pending === "upload"}
            isDisabled={!isOnline || pending === "remove"}
          >
            {me.avatarUrl === null
              ? t("auth:photo.add")
              : t("auth:photo.change")}
          </Button>
        </FileTrigger>
        {canRemove && me.avatarUrl !== null && (
          <Button
            variant="secondary"
            isQuiet
            onPress={() => void remove()}
            isPending={pending === "remove"}
            isDisabled={!isOnline || pending === "upload"}
          >
            {t("auth:photo.remove")}
          </Button>
        )}
      </Flex>
      {problem !== null && (
        <InlineAlert variant="negative">
          {t(`auth:photo.${problem}`)}
        </InlineAlert>
      )}
      {failure !== null && (
        <SendFailure
          error={failure.error}
          transient="couldNotSave"
          withSaveReasons
          onRetry={() => retry(failure)}
          isRetryDisabled={!isOnline}
        />
      )}
    </Stack>
  );
}
