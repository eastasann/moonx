import { emailSchema, passwordSchema } from "@moonx/schemas";
import {
  Button,
  Divider,
  FocusPattern,
  Form,
  Heading,
  Link,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { SendFailure } from "../components/SendFailure";
import { StandaloneFrame } from "../components/StandaloneFrame";
import { useGoogleStart } from "../components/useGoogleStart";
import { dashboardHref } from "../components/workspace";
import {
  AuthError,
  continueWithGoogle,
  safeNext,
  signInWithEmail,
} from "../lib/auth";
import { useAppForm, useOneAtATime } from "../lib/form";
import { useIsOnline } from "../lib/online";
import { meQuery } from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

/** `/login`'s search parameters (SDD 4章). */
export interface LoginSearch {
  /** Where the sign-in goes back to. */
  next?: string;
  /** The state a Google sign-in or a lost session came back with (SDD 5.4). */
  error?: string;
  /** The request a Google sign-in failed in, for its Ref (SDD 8.3). */
  requestId?: string;
}

/** A failed send, and what Retry sends again: the form, or Google's sign-in. */
interface Failure {
  error: unknown;
  retry: "form" | "google";
}

/** The screen's words for a code (design-spec 6.16 2「状態とエラー」, SDD 5.4). */
function useLoginMessages(): Partial<Record<string, string>> {
  const { t } = useTranslation(["errors"]);
  const invalidInvitation = t("errors:INVITATION_INVALID");
  return {
    INVALID_EMAIL_OR_PASSWORD: t("errors:INVALID_EMAIL_OR_PASSWORD"),
    ACCOUNT_SUSPENDED: t("errors:ACCOUNT_SUSPENDED"),
    // A Google sign-up refused by the API, or a Google account with no moonx account.
    INVITATION_REQUIRED: invalidInvitation,
    signup_disabled: invalidInvitation,
  };
}

/**
 * Starts a Google sign-in from 2 (SDD 5.4「Google」): back to `next`, or else to 1, which
 * takes the user on to the workspace they opened last; a failure back to this screen.
 */
function googleFromLogin(next: string | undefined) {
  return continueWithGoogle({
    callbackURL: next ?? "/",
    errorCallbackURL:
      next === undefined
        ? "/login"
        : `/login?${new URLSearchParams({ next }).toString()}`,
  });
}

/**
 * 2 Log in (design-spec 6.16, pattern B): email and password, or Google, and the way to
 * reset a forgotten password. Signing in drops what is cached of anyone before (SDD 8.2)
 * and goes to `next`, or to the workspace opened last (5章「ログイン後」).
 */
export function LoginScreen({ next, error, requestId }: LoginSearch) {
  const { t } = useTranslation(["auth", "app"]);
  useDocumentTitle(t("auth:login.title"));
  const formId = useId();
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const messages = useLoginMessages();
  const backTo = safeNext(next);
  // What Google's sign-in came back with: a code with words, or else unexpected.
  const [failure, setFailure] = useState<Failure | null>(() =>
    error === undefined
      ? null
      : {
          error: new AuthError({ status: null, code: error, requestId }),
          retry: "google",
        },
  );
  const start = useCallback(() => {
    setFailure(null);
    return googleFromLogin(backTo);
  }, [backTo]);
  const onGoogleFailure = useCallback(
    (cause: unknown) => setFailure({ error: cause, retry: "google" }),
    [],
  );
  const { isStarting: isGoogleStarting, startGoogle } = useGoogleStart(
    start,
    onGoogleFailure,
  );
  const oneAtATime = useOneAtATime();
  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        setFailure(null);
        try {
          await signInWithEmail(value.email, value.password);
        } catch (cause) {
          setFailure({ error: cause, retry: "form" });
          return;
        }
        // Signed in: whatever follows goes on, never signing in again. Without the
        // user, 1 takes a signed-in visitor on to their workspace (5章「認証」).
        queryClient.clear();
        const me = await queryClient.fetchQuery(meQuery()).catch(() => null);
        await navigate({
          href: backTo ?? (me === null ? undefined : dashboardHref(me)) ?? "/",
          replace: true,
        });
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
            <Heading level={1}>{t("auth:login.title")}</Heading>
          </Stack>
        }
        actions={
          <form.AppForm>
            <form.SubmitButton
              form={formId}
              isDisabled={!isOnline || isGoogleStarting}
            >
              {t("auth:login.submit")}
            </form.SubmitButton>
          </form.AppForm>
        }
      >
        <Button
          variant="secondary"
          onPress={startGoogle}
          isPending={isGoogleStarting}
          isDisabled={!isOnline}
        >
          {t("auth:google")}
        </Button>
        <Divider size="S" />
        <form.AppForm>
          <Form
            id={formId}
            aria-label={t("auth:login.title")}
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
            <form.AppField
              name="password"
              validators={{ onMount: passwordSchema, onChange: passwordSchema }}
            >
              {(field) => (
                <field.TextField
                  label={t("auth:password")}
                  type="password"
                  autoComplete="current-password"
                  isRequired
                  isReadOnly={!isOnline}
                  width="full"
                />
              )}
            </form.AppField>
          </Form>
        </form.AppForm>
        <Link href="/forgot-password">{t("auth:login.forgotPassword")}</Link>
        {failure !== null && (
          <SendFailure
            error={failure.error}
            messages={messages}
            onRetry={
              failure.retry === "google"
                ? startGoogle
                : () => void form.handleSubmit()
            }
            isRetryDisabled={!isOnline}
          />
        )}
      </FocusPattern>
    </StandaloneFrame>
  );
}
