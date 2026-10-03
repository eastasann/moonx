import {
  Button,
  Divider,
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
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { loginSchema } from "../forms/schemas";
import { ApiError } from "../lib/api-error";
import { authCall, authClient } from "../lib/auth-client";
import { errorText } from "../lib/error-text";
import { fieldProps, validate } from "../lib/form";
import { useGoTo } from "../lib/navigate";
import { oauthErrorCode } from "../lib/oauth-error";
import { dropUserQueries, homePath, loadMe, safeNext } from "../lib/session";

/** Screen 2, log in: email and password, or Google (design-spec 6.16). */
export function Login({ next, error }: { next?: string; error?: string }) {
  const { t } = useTranslation(["auth", "app", "errors"]);
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const [googleError, setGoogleError] = useState<unknown>(null);

  const login = useMutation({
    mutationFn: async (value: { email: string; password: string }) => {
      await authCall(
        authClient().signIn.email({ email: value.email.trim(), password: value.password }),
      );
      dropUserQueries(queryClient);
      const me = await loadMe(queryClient);
      if (!me) throw new ApiError("UNAUTHENTICATED", 401, "No session after sign-in");
      return me;
    },
    onSuccess: (me) => goTo(safeNext(next, homePath(me))),
  });

  const google = useMutation({
    mutationFn: () =>
      authCall(
        authClient().signIn.social({
          provider: "google",
          callbackURL: safeNext(next, "/"),
          errorCallbackURL: "/login",
        }),
      ),
    onError: setGoogleError,
  });

  const formId = useId();
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: validate(loginSchema, t) },
    onSubmit: ({ value }) => login.mutateAsync(value).catch(() => {}),
  });

  const failure = login.error ?? googleError;
  const alert = failure
    ? errorText(t, failure)
    : error
      ? t(`errors:${oauthErrorCode(error)}`)
      : null;

  return (
    <PageFrame>
      <FocusPattern
        hasTabBar={false}
        header={<Heading level={1}>{t("auth:login.title")}</Heading>}
        actions={
          <Button
            type="submit"
            form={formId}
            variant="accent"
            isPending={login.isPending}
            pendingLabel={t("app:signingIn")}
          >
            {t("auth:login.submit")}
          </Button>
        }
      >
        <Stack gap="space-300">
          {alert ? <InlineAlert variant="negative" heading={alert} /> : null}
          <Form
            id={formId}
            aria-label={t("auth:login.title")}
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
            <form.Field name="password">
              {(field) => (
                <TextField
                  label={t("auth:fields.password")}
                  type="password"
                  autoComplete="current-password"
                  isRequired
                  {...fieldProps(field)}
                />
              )}
            </form.Field>
          </Form>
          <Link href="/forgot-password">{t("auth:login.forgot")}</Link>
          <Divider />
          <Button
            variant="secondary"
            isPending={google.isPending}
            pendingLabel={t("app:signingIn")}
            onPress={() => {
              setGoogleError(null);
              google.mutate();
            }}
          >
            {t("auth:google")}
          </Button>
        </Stack>
      </FocusPattern>
    </PageFrame>
  );
}
