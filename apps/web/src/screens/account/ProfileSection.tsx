import {
  Avatar,
  Button,
  FileTrigger,
  Flex,
  Heading,
  InlineAlert,
  Stack,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SaveFailureNotice } from "../../components/SaveFailureNotice";
import { profileSchema } from "../../forms/schemas";
import { autosave } from "../../lib/autosave";
import { errorText } from "../../lib/error-text";
import { validate } from "../../lib/form";
import { PHOTO_TYPES, usePhotoUpload } from "../../lib/photo";
import { ME_KEY, useMe } from "../../lib/session";
import { AUTOSAVE_DELAY_MS, useSavedItem } from "../../lib/use-saved-item";

const nameSchema = profileSchema.pick({ displayName: true });

/**
 * Screen 4, profile: photo, display name and the email shown for reference. The name saves when
 * typing rests or the field is left (design-spec 1.3, no save button); an empty or too long name
 * is not sent and the field says why.
 */
export function ProfileSection() {
  const { t } = useTranslation(["account", "app"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const { upload, remove, photoError } = usePhotoUpload();

  const checkName = useMemo(() => validate(nameSchema, t), [t]);
  const [name, setName] = useState(me.displayName);
  const [nameError, setNameError] = useState<string | undefined>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(name);

  // Everything the name was last handed to the autosave engine as, so a typed value that is
  // changed back before the first answer arrives is still sent (the cache has not caught up yet).
  const queued = useRef(me.displayName);

  // The name is no versioned item: `/me` ignores the `lockVersion` the engine adds and never answers
  // 409, so the engine is used for what it adds here: one request at a time in order, a retry, and
  // being sent by `flushAll` before logout.
  const {
    save: saveItem,
    flush: sendItem,
    failure,
    retry,
  } = useSavedItem({
    itemKey: "profile:display-name",
    method: "PATCH",
    url: "/api/v1/me",
    lockVersion: 0,
    onSaved: (data) => {
      queryClient.setQueryData(ME_KEY, data);
    },
    onAdopt: () => {},
    onRestore: (patch) => {
      if (typeof patch.displayName !== "string") return;
      setName(patch.displayName);
      latest.current = patch.displayName;
      queued.current = patch.displayName;
    },
  });

  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const displayName = latest.current.trim();
    const problem = checkName({ value: { displayName } })?.fields.displayName;
    setNameError(problem);
    if (problem || displayName === queued.current) return Promise.resolve();
    queued.current = displayName;
    saveItem({ displayName });
    return sendItem();
  }, [checkName, saveItem, sendItem]);

  // Logging out sends a name that is still resting in the timer window.
  useEffect(() => autosave.registerFlusher(flush), [flush]);

  useEffect(
    () => () => {
      if (timer.current) void flush();
    },
    [flush],
  );

  return (
    <Stack gap="space-300" as="section">
      <Heading level={2}>{t("account:profile.title")}</Heading>
      {photoError ? <InlineAlert variant="negative" heading={errorText(t, photoError)} /> : null}
      <Flex gap="space-200" align="center" wrap>
        <Avatar name={me.displayName} src={me.avatarUrl} />
        <FileTrigger
          acceptedFileTypes={PHOTO_TYPES}
          onSelect={(files) => files[0] && upload.mutate(files[0])}
        >
          <Button variant="secondary" isPending={upload.isPending} pendingLabel={t("app:saving")}>
            {t("account:profile.choosePhoto")}
          </Button>
        </FileTrigger>
        {me.avatarUrl ? (
          <Button
            variant="secondary"
            isPending={remove.isPending}
            pendingLabel={t("app:saving")}
            onPress={() => remove.mutate()}
          >
            {t("account:profile.removePhoto")}
          </Button>
        ) : null}
      </Flex>
      <Text variant="caption" tone="secondary">
        {t("account:profile.photoHint")}
      </Text>
      {failure ? (
        <SaveFailureNotice
          failure={failure}
          onRetry={() => retry({ displayName: latest.current.trim() })}
        />
      ) : null}
      <TextField
        label={t("account:profile.displayName")}
        autoComplete="name"
        isRequired
        value={name}
        onChange={(value) => {
          setName(value);
          latest.current = value;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
        }}
        onBlur={flush}
        isInvalid={Boolean(nameError)}
        errorMessage={nameError}
      />
      <TextField label={t("account:profile.email")} value={me.email} isReadOnly />
    </Stack>
  );
}
