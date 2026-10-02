import {
  Button,
  Dialog,
  Form,
  Heading,
  InlineAlert,
  Link,
  Stack,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { deleteAccountSchema } from "../../forms/schemas";
import { postJson } from "../../lib/api";
import { isApiError } from "../../lib/api-error";
import { errorText } from "../../lib/error-text";
import { fieldProps, validate } from "../../lib/form";
import { useLogout } from "../../lib/logout";
import { useGoTo } from "../../lib/navigate";
import { useMe } from "../../lib/session";
import { applyTheme } from "../../lib/theme";

interface BlockingWorkspace {
  id: string;
  name: string;
}

function blockingWorkspaces(error: unknown): BlockingWorkspace[] {
  if (!isApiError(error) || error.code !== "LAST_OWNER") return [];
  const list = error.extra.workspaces;
  return Array.isArray(list) ? (list as BlockingWorkspace[]) : [];
}

/**
 * Screen 4, Delete account (design-spec 6.16). The dialog says what goes and what stays, asks for
 * the email address and, for people with a password, the password. A Google-only account must
 * have logged in within the last ten minutes, which the API checks.
 */
export function DeleteAccountSection() {
  const { t } = useTranslation(["account", "app"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const logout = useLogout();
  const formId = useId();
  const [open, setOpen] = useState(false);

  const remove = useMutation({
    mutationFn: (value: { confirmEmail: string; password: string }) =>
      postJson("/api/v1/me/delete", {
        confirmEmail: value.confirmEmail.trim(),
        ...(me.hasPassword ? { password: value.password } : {}),
      }),
    onSuccess: () => {
      queryClient.clear();
      applyTheme(undefined);
      goTo("/");
    },
  });
  const form = useForm({
    defaultValues: { confirmEmail: "", password: "" },
    validators: {
      onSubmit: validate(
        me.hasPassword
          ? deleteAccountSchema.extend({ password: deleteAccountSchema.shape.password.min(1) })
          : deleteAccountSchema,
        t,
      ),
    },
    onSubmit: ({ value }) => remove.mutateAsync(value).catch(() => {}),
  });

  const blockers = blockingWorkspaces(remove.error);
  const needsLogin = isApiError(remove.error) && remove.error.code === "REAUTH_REQUIRED";

  return (
    <Stack gap="space-300" as="section">
      <Heading level={2}>{t("account:delete.title")}</Heading>
      <Text tone="secondary">{t("account:delete.hint")}</Text>
      <Stack gap="space-100" align="start">
        <Button
          variant="negative"
          onPress={() => {
            remove.reset();
            setOpen(true);
          }}
        >
          {t("account:delete.open")}
        </Button>
      </Stack>
      <Dialog
        isOpen={open}
        onOpenChange={setOpen}
        size="medium"
        title={t("account:delete.dialogTitle")}
        closeLabel={t("app:close")}
        isKeyboardDismissDisabled={remove.isPending}
        actions={
          <>
            <Button variant="secondary" onPress={() => setOpen(false)}>
              {t("app:cancel")}
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="negative"
              isPending={remove.isPending}
              pendingLabel={t("account:delete.deleting")}
            >
              {t("account:delete.confirm")}
            </Button>
          </>
        }
      >
        <Stack gap="space-300">
          <Stack gap="space-100">
            <Text variant="label">{t("account:delete.erasedTitle")}</Text>
            <Text tone="secondary">{t("account:delete.erased")}</Text>
            <Text variant="label">{t("account:delete.keptTitle")}</Text>
            <Text tone="secondary">{t("account:delete.kept")}</Text>
          </Stack>
          {blockers.length > 0 ? (
            <InlineAlert variant="negative" heading={t("account:delete.lastOwnerHeading")}>
              <Stack gap="space-50">
                {blockers.map((workspace) => (
                  <Link key={workspace.id} href={`/w/${workspace.id}/settings`}>
                    {t("account:delete.lastOwner", { name: workspace.name })}
                  </Link>
                ))}
              </Stack>
            </InlineAlert>
          ) : remove.error ? (
            <InlineAlert
              variant="negative"
              heading={needsLogin ? t("account:delete.reauth") : errorText(t, remove.error)}
            />
          ) : null}
          {needsLogin ? (
            <Stack gap="space-100" align="start">
              <Button variant="secondary" onPress={() => void logout({ next: "/account" })}>
                {t("account:logInAgain")}
              </Button>
            </Stack>
          ) : null}
          <Form
            id={formId}
            aria-label={t("account:delete.dialogTitle")}
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="confirmEmail">
              {(field) => (
                <TextField
                  label={t("account:delete.confirmEmail")}
                  description={t("account:delete.confirmEmailHint", { email: me.email })}
                  type="email"
                  autoComplete="off"
                  isRequired
                  {...fieldProps(field)}
                />
              )}
            </form.Field>
            {me.hasPassword ? (
              <form.Field name="password">
                {(field) => (
                  <TextField
                    label={t("account:delete.password")}
                    type="password"
                    autoComplete="current-password"
                    isRequired
                    {...fieldProps(field)}
                  />
                )}
              </form.Field>
            ) : null}
          </Form>
        </Stack>
      </Dialog>
    </Stack>
  );
}
