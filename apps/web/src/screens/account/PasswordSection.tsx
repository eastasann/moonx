import { Button, Form, Heading, InlineAlert, Stack, Text, TextField } from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { changePasswordSchema, newPasswordSchema } from "../../forms/schemas";
import { api, call } from "../../lib/api";
import { isApiError } from "../../lib/api-error";
import { authCall, authClient } from "../../lib/auth-client";
import { errorText } from "../../lib/error-text";
import { fieldProps, validate } from "../../lib/form";
import { useLogout } from "../../lib/logout";
import { ME_KEY, useMe } from "../../lib/session";
import { toasts } from "../../lib/toast";

/** Change the password; this ends the other sessions (SDD 5.4). */
function ChangePassword() {
  const { t } = useTranslation(["account", "auth", "app"]);
  const change = useMutation({
    mutationFn: (value: { currentPassword: string; newPassword: string }) =>
      authCall(
        authClient().changePassword({
          currentPassword: value.currentPassword,
          newPassword: value.newPassword,
          revokeOtherSessions: true,
        }),
      ),
    onSuccess: () => {
      form.reset();
      toasts.add({ title: t("account:password.changed"), variant: "positive" });
    },
  });
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validators: { onSubmit: validate(changePasswordSchema, t) },
    onSubmit: ({ value }) => change.mutateAsync(value).catch(() => {}),
  });
  return (
    <Stack gap="space-300">
      <Text tone="secondary">{t("account:password.changeHint")}</Text>
      {change.error ? (
        <InlineAlert variant="negative" heading={errorText(t, change.error)} />
      ) : null}
      <Form
        aria-label={t("account:password.title")}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="currentPassword">
          {(field) => (
            <TextField
              label={t("account:password.current")}
              type="password"
              autoComplete="current-password"
              isRequired
              {...fieldProps(field)}
            />
          )}
        </form.Field>
        <form.Field name="newPassword">
          {(field) => (
            <TextField
              label={t("auth:fields.newPassword")}
              type="password"
              autoComplete="new-password"
              description={t("auth:fields.passwordRule")}
              isRequired
              {...fieldProps(field)}
            />
          )}
        </form.Field>
        <form.Field name="confirmPassword">
          {(field) => (
            <TextField
              label={t("auth:fields.confirmPassword")}
              type="password"
              autoComplete="new-password"
              isRequired
              {...fieldProps(field)}
            />
          )}
        </form.Field>
        <Button type="submit" isPending={change.isPending} pendingLabel={t("app:saving")}>
          {t("account:password.change")}
        </Button>
      </Form>
    </Stack>
  );
}

/** "Set password" for an account made with Google, so it can also log in with a password (U8). */
function SetPassword() {
  const { t } = useTranslation(["account", "auth", "app"]);
  const queryClient = useQueryClient();
  const logout = useLogout();
  const set = useMutation({
    mutationFn: (newPassword: string) => call(api().api.v1.me.password.post({ newPassword })),
    onSuccess: async () => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      toasts.add({ title: t("account:password.set"), variant: "positive" });
    },
  });
  const form = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    validators: { onSubmit: validate(newPasswordSchema, t) },
    onSubmit: ({ value }) => set.mutateAsync(value.newPassword).catch(() => {}),
  });
  const needsLogin = isApiError(set.error) && set.error.code === "REAUTH_REQUIRED";
  return (
    <Stack gap="space-300">
      <Text tone="secondary">{t("account:password.setHint")}</Text>
      {set.error ? (
        <InlineAlert
          variant="negative"
          heading={needsLogin ? t("account:password.reauth") : errorText(t, set.error)}
        />
      ) : null}
      {needsLogin ? (
        <Button variant="secondary" onPress={() => void logout({ next: "/account" })}>
          {t("account:logInAgain")}
        </Button>
      ) : null}
      <Form
        aria-label={t("account:password.setTitle")}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="newPassword">
          {(field) => (
            <TextField
              label={t("auth:fields.newPassword")}
              type="password"
              autoComplete="new-password"
              description={t("auth:fields.passwordRule")}
              isRequired
              {...fieldProps(field)}
            />
          )}
        </form.Field>
        <form.Field name="confirmPassword">
          {(field) => (
            <TextField
              label={t("auth:fields.confirmPassword")}
              type="password"
              autoComplete="new-password"
              isRequired
              {...fieldProps(field)}
            />
          )}
        </form.Field>
        <Button type="submit" isPending={set.isPending} pendingLabel={t("app:saving")}>
          {t("account:password.setButton")}
        </Button>
      </Form>
    </Stack>
  );
}

/** Screen 4, password: change it, or set the first one for a Google-only account. */
export function PasswordSection() {
  const { t } = useTranslation("account");
  const me = useMe();
  return (
    <Stack gap="space-300" as="section">
      <Heading level={2}>{me.hasPassword ? t("password.title") : t("password.setTitle")}</Heading>
      {me.hasPassword ? <ChangePassword /> : <SetPassword />}
    </Stack>
  );
}
