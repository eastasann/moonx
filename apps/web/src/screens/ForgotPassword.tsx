import { emailSchema } from "@moonx/schemas";
import {
  Button,
  FocusPattern,
  Form,
  Heading,
  InlineAlert,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { SendFailure } from "../components/SendFailure";
import { StandaloneFrame } from "../components/StandaloneFrame";
import { requestPasswordReset } from "../lib/auth";
import { useAppForm, useOneAtATime } from "../lib/form";
import { useIsOnline } from "../lib/online";
import { useDocumentTitle } from "../lib/title";

/**
 * 2's "Forgot password?" (design-spec 6.16, pattern B): sends the reset mail (A6). What
 * it says after is the same whether or not the address has an account; the link lasts
 * an hour. Cancel goes back to Log in.
 */
export function ForgotPasswordScreen() {
  const { t } = useTranslation(["auth", "app"]);
  useDocumentTitle(t("auth:forgotPassword.title"));
  const formId = useId();
  const isOnline = useIsOnline();
  const navigate = useNavigate();
  // The address the last mail went to, which the answer names.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const oneAtATime = useOneAtATime();
  const form = useAppForm({
    defaultValues: { email: "" },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        setFailure(null);
        setSentTo(null);
        try {
          await requestPasswordReset(value.email);
          setSentTo(value.email);
        } catch (cause) {
          setFailure(cause);
        }
      }),
  });
  return (
    <StandaloneFrame>
      <FocusPattern
        header={
          <Stack gap="space-75">
            <Text variant="caption" tone="secondary">
              {t("app:name")}
            </Text>
            <Heading level={1}>{t("auth:forgotPassword.title")}</Heading>
          </Stack>
        }
        actions={
          <>
            <Button
              variant="secondary"
              isQuiet
              onPress={() => void navigate({ to: "/login" })}
            >
              {t("auth:forgotPassword.cancel")}
            </Button>
            <form.AppForm>
              <form.SubmitButton form={formId} isDisabled={!isOnline}>
                {t("auth:forgotPassword.submit")}
              </form.SubmitButton>
            </form.AppForm>
          </>
        }
      >
        <form.AppForm>
          <Form
            id={formId}
            aria-label={t("auth:forgotPassword.title")}
            onSubmit={() => void form.handleSubmit()}
          >
            <form.AppField
              name="email"
              validators={{ onMount: emailSchema, onChange: emailSchema }}
            >
              {(field) => (
                <field.TextField
                  label={t("auth:email")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  isRequired
                  isReadOnly={!isOnline}
                  width="full"
                />
              )}
            </form.AppField>
          </Form>
        </form.AppForm>
        {sentTo !== null && (
          <InlineAlert variant="informative">
            {t("auth:forgotPassword.sent", { email: sentTo })}
          </InlineAlert>
        )}
        {failure !== null && (
          <SendFailure
            error={failure}
            onRetry={() => void form.handleSubmit()}
            isRetryDisabled={!isOnline}
          />
        )}
      </FocusPattern>
    </StandaloneFrame>
  );
}
