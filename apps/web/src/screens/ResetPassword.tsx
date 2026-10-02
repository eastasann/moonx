import {
  Button,
  FocusPattern,
  Form,
  Heading,
  InlineAlert,
  Link,
  PageFrame,
  Stack,
  TextField,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { newPasswordSchema } from "../forms/schemas";
import { ApiError, isApiError } from "../lib/api-error";
import { authCall, authClient } from "../lib/auth-client";
import { errorText } from "../lib/error-text";
import { fieldProps, validate } from "../lib/form";
import { useGoTo } from "../lib/navigate";
import { homePath, loadMe, ME_KEY } from "../lib/session";

/**
 * Screen 2, choose a new password from the emailed link. Resetting signs the person in, so they
 * go straight to their workspace (design-spec 6.16).
 */
export function ResetPassword({ token }: { token?: string }) {
  const { t } = useTranslation(["auth", "app"]);
  const queryClient = useQueryClient();
  const goTo = useGoTo();

  const reset = useMutation({
    mutationFn: async (newPassword: string) => {
      await authCall(authClient().resetPassword({ newPassword, token }));
      queryClient.removeQueries({ queryKey: ME_KEY });
      const me = await loadMe(queryClient);
      if (!me) throw new ApiError("UNAUTHENTICATED", 401, "No session after the reset");
      return me;
    },
    onSuccess: (me) => goTo(homePath(me)),
  });
  const form = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    validators: { onSubmit: validate(newPasswordSchema, t) },
    onSubmit: ({ value }) => reset.mutateAsync(value.newPassword).catch(() => {}),
  });

  const header = <Heading level={1}>{t("auth:reset.title")}</Heading>;
  if (!token || (isApiError(reset.error) && reset.error.code === "INVALID_TOKEN")) {
    return (
      <PageFrame>
        <FocusPattern hasTabBar={false} header={header}>
          <Stack gap="space-300" align="start">
            <InlineAlert variant="negative" heading={t("auth:errors.invalidToken")} />
            <Link href="/forgot-password">{t("auth:reset.requestNew")}</Link>
          </Stack>
        </FocusPattern>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <FocusPattern hasTabBar={false} header={header}>
        <Stack gap="space-300">
          {reset.error ? (
            <InlineAlert variant="negative" heading={errorText(t, reset.error)} />
          ) : null}
          <Form
            aria-label={t("auth:reset.title")}
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
                  autoFocus
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
            <Button
              type="submit"
              variant="accent"
              isPending={reset.isPending}
              pendingLabel={t("app:saving")}
            >
              {t("auth:reset.submit")}
            </Button>
          </Form>
        </Stack>
      </FocusPattern>
    </PageFrame>
  );
}
