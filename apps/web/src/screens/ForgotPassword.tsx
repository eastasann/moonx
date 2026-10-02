import {
  Button,
  FocusPattern,
  Form,
  Heading,
  InlineAlert,
  Link,
  PageFrame,
  Stack,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { forgotPasswordSchema } from "../forms/schemas";
import { authCall, authClient } from "../lib/auth-client";
import { errorText } from "../lib/error-text";
import { fieldProps, validate } from "../lib/form";

/** Screen 2, send the password reset link (design-spec 6.16). The link lives one hour. */
export function ForgotPassword() {
  const { t } = useTranslation(["auth", "app"]);
  const send = useMutation({
    mutationFn: (email: string) =>
      authCall(
        authClient().requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" }),
      ),
  });
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: validate(forgotPasswordSchema, t) },
    onSubmit: ({ value }) => send.mutateAsync(value.email).catch(() => {}),
  });

  return (
    <PageFrame>
      <FocusPattern
        hasTabBar={false}
        header={<Heading level={1}>{t("auth:forgot.title")}</Heading>}
      >
        <Stack gap="space-300">
          {send.isSuccess ? (
            <InlineAlert variant="informative" heading={t("auth:forgot.sent")} />
          ) : (
            <>
              <Text variant="body-long">{t("auth:forgot.lead")}</Text>
              {send.error ? (
                <InlineAlert variant="negative" heading={errorText(t, send.error)} />
              ) : null}
              <Form
                aria-label={t("auth:forgot.title")}
                onSubmit={(event) => {
                  event.preventDefault();
                  void form.handleSubmit();
                }}
              >
                <form.Field name="email">
                  {(field) => (
                    <TextField
                      label={t("auth:fields.email")}
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      isRequired
                      autoFocus
                      {...fieldProps(field)}
                    />
                  )}
                </form.Field>
                <Button
                  type="submit"
                  variant="accent"
                  isPending={send.isPending}
                  pendingLabel={t("app:sending")}
                >
                  {t("auth:forgot.submit")}
                </Button>
              </Form>
            </>
          )}
          <Link href="/login">{t("auth:backToLogin")}</Link>
        </Stack>
      </FocusPattern>
    </PageFrame>
  );
}
