import { passwordSchema } from "@moonx/schemas";
import {
  AlertDialog,
  Button,
  ButtonGroup,
  Dialog,
  Form,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthError, signInWithEmail } from "../lib/auth";
import { useAutosave } from "../lib/autosave-react";
import { useAppForm, useOneAtATime } from "../lib/form";
import { useIsOnline } from "../lib/online";
import { meQuery } from "../lib/queries";
import { SendFailure } from "./SendFailure";

/**
 * Leaves for the sign-in screen with the way back (SDD 8.2): the cache and the unsaved
 * input are dropped first, so whoever signs in next finds nothing of them.
 */
function useLeaveForLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  return (error?: "ACCOUNT_SUSPENDED") => {
    const { pathname, searchStr } = router.latestLocation;
    const search = new URLSearchParams({ next: `${pathname}${searchStr}` });
    if (error !== undefined) search.set("error", error);
    autosave.discardAll();
    queryClient.clear();
    void router.navigate({ href: `/login?${search}`, replace: true });
  };
}

/**
 * M9 Sign in again (design-spec 3.8・5章「認証」, SDD 8.2): the session ended while input
 * was not saved. Signing in with the password, the email fixed to the account's, keeps the
 * screen and its cache and sends what was held. Signing in on the login page (Google
 * users have no other way) first confirms that the unsaved changes will be lost. A wrong
 * password says so; a rate limit shows inside it, which stays open; a suspended account
 * drops the input and goes to the login page with its words. Shown while the saves ask
 * for it (`needsSignIn`).
 */
export function SignInAgainDialog() {
  const { t } = useTranslation(["app", "auth", "errors"]);
  const formId = useId();
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const leave = useLeaveForLogin();
  const isOnline = useIsOnline();
  const me = queryClient.getQueryData(meQuery().queryKey);
  const [failure, setFailure] = useState<unknown>(null);
  const [isLeaving, setLeaving] = useState(false);
  const oneAtATime = useOneAtATime();
  const form = useAppForm({
    defaultValues: { password: "" },
    // "Password is incorrect" stands until the password changes.
    listeners: { onChange: () => setFailure(null) },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        setFailure(null);
        try {
          await signInWithEmail(me?.email ?? "", value.password);
        } catch (error) {
          if (
            error instanceof AuthError &&
            error.code === "ACCOUNT_SUSPENDED"
          ) {
            leave("ACCOUNT_SUSPENDED");
            return;
          }
          setFailure(error);
          return;
        }
        autosave.resumeAfterSignIn();
        // The screens that met the lost session load again; what is cached stays.
        void queryClient.invalidateQueries();
      }),
  });
  const hasPassword = me?.hasPassword ?? true;
  return (
    <>
      <Dialog
        isOpen={!isLeaving}
        size="S"
        density="spacious"
        title={t("app:signInAgain.title")}
        isKeyboardDismissDisabled
        buttons={
          <ButtonGroup align="end">
            <Button
              variant="secondary"
              isQuiet={hasPassword}
              onPress={() => setLeaving(true)}
            >
              {t("app:signInAgain.loginPage")}
            </Button>
            {hasPassword && (
              <form.AppForm>
                <form.SubmitButton form={formId} isDisabled={!isOnline}>
                  {t("app:signInAgain.submit")}
                </form.SubmitButton>
              </form.AppForm>
            )}
          </ButtonGroup>
        }
      >
        <Form
          id={formId}
          onSubmit={() => {
            void form.handleSubmit();
          }}
        >
          <Text elementType="p">
            {hasPassword
              ? t("app:signInAgain.lead")
              : t("app:signInAgain.googleLead")}
          </Text>
          {hasPassword && (
            <TextField
              label={t("auth:email")}
              value={me?.email ?? ""}
              isReadOnly
            />
          )}
          {hasPassword && (
            <form.AppField
              name="password"
              validators={{
                onMount: passwordSchema,
                onChange: passwordSchema,
              }}
            >
              {(field) => (
                <field.TextField
                  label={t("auth:password")}
                  type="password"
                  autoComplete="current-password"
                  isRequired
                  isReadOnly={!isOnline}
                  autoFocus
                  rejection={
                    failure instanceof AuthError &&
                    failure.code === "INVALID_EMAIL_OR_PASSWORD"
                      ? t("app:signInAgain.wrongPassword")
                      : undefined
                  }
                />
              )}
            </form.AppField>
          )}
          {failure !== null &&
            !(
              failure instanceof AuthError &&
              failure.code === "INVALID_EMAIL_OR_PASSWORD"
            ) && (
              <SendFailure
                error={failure}
                onRetry={() => void form.handleSubmit()}
                isRetryDisabled={!isOnline}
              />
            )}
        </Form>
      </Dialog>
      {isLeaving && (
        <AlertDialog
          isOpen
          variant="warning"
          size="S"
          title={t("app:unsaved.leaveTitle")}
          primaryActionLabel={t("app:signInAgain.loginPage")}
          cancelLabel={t("app:unsaved.cancel")}
          onPrimaryAction={() => leave()}
          onCancel={() => setLeaving(false)}
        >
          {t("app:unsaved.message")}
        </AlertDialog>
      )}
    </>
  );
}
