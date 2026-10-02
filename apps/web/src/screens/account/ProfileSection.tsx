import {
  Avatar,
  Button,
  FileTrigger,
  Flex,
  Form,
  Heading,
  InlineAlert,
  Stack,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { profileSchema } from "../../forms/schemas";
import { api, call } from "../../lib/api";
import { errorText } from "../../lib/error-text";
import { fieldProps, validate } from "../../lib/form";
import { PHOTO_TYPES, usePhotoUpload } from "../../lib/photo";
import { ME_KEY, useMe } from "../../lib/session";
import { toasts } from "../../lib/toast";

/** Screen 4, profile: photo, display name and the email shown for reference. */
export function ProfileSection() {
  const { t } = useTranslation(["account", "app"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const { upload, remove, photoError } = usePhotoUpload();

  const save = useMutation({
    mutationFn: (displayName: string) =>
      call(api().api.v1.me.patch({ displayName: displayName.trim() })),
    onSuccess: (updated) => {
      queryClient.setQueryData(ME_KEY, updated);
      toasts.add({ title: t("account:profile.saved"), variant: "positive" });
    },
  });
  const form = useForm({
    defaultValues: { displayName: me.displayName, timezone: me.timezone },
    validators: { onSubmit: validate(profileSchema, t) },
    onSubmit: ({ value }) => save.mutateAsync(value.displayName).catch(() => {}),
  });

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
      {save.error ? <InlineAlert variant="negative" heading={errorText(t, save.error)} /> : null}
      <Form
        aria-label={t("account:profile.title")}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="displayName">
          {(field) => (
            <TextField
              label={t("account:profile.displayName")}
              autoComplete="name"
              isRequired
              {...fieldProps(field)}
            />
          )}
        </form.Field>
        <TextField label={t("account:profile.email")} value={me.email} isReadOnly />
        <Button type="submit" isPending={save.isPending} pendingLabel={t("app:saving")}>
          {t("app:save")}
        </Button>
      </Form>
    </Stack>
  );
}
