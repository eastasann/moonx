import { passwordSchema } from "@moonx/schemas";
import {
  FocusPattern,
  Form,
  Heading,
  InlineAlert,
  Link,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { failureCode, SendFailure } from "../components/SendFailure";
import { StandaloneFrame } from "../components/StandaloneFrame";
import { dashboardHref } from "../components/workspace";
import { resetPassword } from "../lib/auth";
import { useAppForm, useOneAtATime, useRejectedFields } from "../lib/form";
import { useIsOnline } from "../lib/online";
import { meQuery } from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

/**
 * "This link has expired or was already used." and the way to a new mail (design-spec
 * 6.16): one wording for an expired, used or unknown link, so its state does not show.
 */
function ExpiredLink() {
  const { t } = useTranslation(["auth", "errors"]);
  return (
    <InlineAlert variant="negative">
      <Stack gap="space-100">
        <Text>{t("errors:INVALID_TOKEN")}</Text>
        <Link href="/forgot-password">{t("auth:resetPassword.sendAgain")}</Link>
      </Stack>
    </InlineAlert>
  );
}

/**
 * 2's new password, from the reset mail's link (design-spec 6.16, pattern B): A7 sets it,
 * ends every other session and signs this one in, so it goes on to 5 (SDD 5.4). What is
 * cached of anyone before is dropped first (SDD 8.2).
 */
export function ResetPasswordScreen({ token }: { token: string | undefined }) {
  const { t } = useTranslation(["auth", "app", "errors"]);
  useDocumentTitle(t("auth:resetPassword.title"));
  const formId = useId();
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<unknown>(null);
  const rejections = useRejectedFields(["newPassword"] as const);
  const oneAtATime = useOneAtATime();
  const form = useAppForm({
    defaultValues: { newPassword: "" },
    listeners: {
      onChange: ({ fieldApi }) => rejections.clear(fieldApi.name),
    },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        if (token === undefined) return;
        setFailure(null);
        rejections.clear();
        try {
          await resetPassword(token, value.newPassword);
        } catch (cause) {
          if (!rejections.reject(cause)) setFailure(cause);
          return;
        }
        // Set and signed in: whatever follows goes on, never sending the used link
        // again. Without the user, 1 takes a signed-in visitor on to 5 (5章「認証」).
        queryClient.clear();
        const me = await queryClient.fetchQuery(meQuery()).catch(() => null);
        await navigate({
          href: (me === null ? undefined : dashboardHref(me)) ?? "/",
          replace: true,
        });
      }),
  });
  const isExpired =
    token === undefined || failureCode(failure) === "INVALID_TOKEN";
  return (
    <StandaloneFrame>
      <FocusPattern
        header={
          <Stack gap="space-75">
            <Text variant="caption" tone="secondary">
              {t("app:name")}
            </Text>
            <Heading level={1}>{t("auth:resetPassword.title")}</Heading>
          </Stack>
        }
        actions={
          isExpired ? undefined : (
            <form.AppForm>
              <form.SubmitButton form={formId} isDisabled={!isOnline}>
                {t("auth:resetPassword.submit")}
              </form.SubmitButton>
            </form.AppForm>
          )
        }
      >
        {isExpired ? (
          <ExpiredLink />
        ) : (
          <>
            <form.AppForm>
              <Form
                id={formId}
                aria-label={t("auth:resetPassword.title")}
                onSubmit={() => void form.handleSubmit()}
              >
                <form.AppField
                  name="newPassword"
                  validators={{
                    onMount: passwordSchema,
                    onChange: passwordSchema,
                  }}
                >
                  {(field) => (
                    <field.TextField
                      rejection={rejections.rejectionOf("newPassword")}
                      label={t("auth:resetPassword.newPassword")}
                      type="password"
                      autoComplete="new-password"
                      isRequired
                      isReadOnly={!isOnline}
                      width="full"
                    />
                  )}
                </form.AppField>
              </Form>
            </form.AppForm>
            {failure !== null && (
              <SendFailure
                error={failure}
                messages={{ ACCOUNT_SUSPENDED: t("errors:ACCOUNT_SUSPENDED") }}
                onRetry={() => void form.handleSubmit()}
                isRetryDisabled={!isOnline}
              />
            )}
          </>
        )}
      </FocusPattern>
    </StandaloneFrame>
  );
}
