import {
  displayNameSchema,
  type InvitationPreview,
  type Me,
  passwordSchema,
  timeZoneSchema,
} from "@moonx/schemas";
import {
  Button,
  Divider,
  FocusPattern,
  Form,
  Heading,
  Stack,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { InvalidInvitation } from "../components/InvalidInvitation";
import { failureCode, SendFailure } from "../components/SendFailure";
import { StandaloneFrame } from "../components/StandaloneFrame";
import { StandaloneLoading } from "../components/StandaloneLoading";
import { FailureState } from "../components/states";
import { useGoogleStart } from "../components/useGoogleStart";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import { continueWithGoogle } from "../lib/auth";
import { useAppForm, useOneAtATime, useRejectedFields } from "../lib/form";
import { useIsOnline } from "../lib/online";
import {
  invitationQuery,
  isInvitationToken,
  meQuery,
  signedInQuery,
} from "../lib/queries";
import { dropAllBut } from "../lib/session";
import { useDocumentTitle } from "../lib/title";

/** What `users.timezone` starts as when the device names no zone moonx knows (SDD 6.3). */
const FALLBACK_TIME_ZONE = "Asia/Manila";

/** The device's time zone, which a new account starts with (design-spec 6.16 3 ②). */
export function deviceTimeZone(): string {
  const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZoneSchema.safeParse(zone).success ? zone : FALLBACK_TIME_ZONE;
}

/** Where a sign-up from the invitation goes on: 3, its steps from ① (SDD 4章 `/welcome`). */
const welcomeHref = (token: string) =>
  `/welcome?${new URLSearchParams({ step: "invite", token, new: "1" }).toString()}`;

function SignUpSkeleton() {
  const { t } = useTranslation(["auth"]);
  return (
    <FocusPattern
      header={<Heading level={1}>{t("auth:signUp.title")}</Heading>}
    >
      <Text>{t("auth:google")}</Text>
      <Text>{t("auth:email")}</Text>
      <Text>{t("auth:signUp.displayName")}</Text>
      <Text>{t("auth:password")}</Text>
    </FocusPattern>
  );
}

/**
 * `/invite/$token` (SDD 4章, design-spec 6.16): signed in, the invitation's ① in 3;
 * signed out with an account for its address, Log in and back here; otherwise 2's sign-up.
 */
export function InviteScreen({ token }: { token: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Asked on this visit: a cached answer may be of a session ended since.
  const signedIn = useQuery({ ...signedInQuery(), refetchOnMount: "always" });
  const isToken = isInvitationToken(token);
  const invitation = useQuery({
    ...invitationQuery(token),
    enabled: isToken,
  });
  const isSignedIn = signedIn.isFetchedAfterMount && signedIn.data != null;
  const toLogIn =
    !isSignedIn &&
    invitation.data?.accountExists === true &&
    signedIn.isFetchedAfterMount;
  useEffect(() => {
    if (isSignedIn) {
      void navigate({
        href: `/welcome?${new URLSearchParams({ step: "invite", token }).toString()}`,
        replace: true,
      });
    } else if (toLogIn) {
      void navigate({
        to: "/login",
        search: { next: `/invite/${token}` },
        replace: true,
      });
    }
  }, [isSignedIn, toLogIn, token, navigate]);
  const retry = () => {
    void queryClient.invalidateQueries({ queryKey: ["invitations", token] });
    void signedIn.refetch();
  };
  if (!isToken) return <InvalidInvitation />;
  if (invitation.isError) {
    const { error } = invitation;
    if (error instanceof ApiError && error.code === "INVITATION_INVALID") {
      return <InvalidInvitation />;
    }
    return (
      <StandaloneFrame>
        <FailureState error={error} onRetry={retry} />
      </StandaloneFrame>
    );
  }
  // Signed out is the answer the form waits for; a failure to ask counts as signed out.
  const isSignedOut =
    signedIn.isError ||
    (signedIn.isFetchedAfterMount && signedIn.data === null);
  if (invitation.data === undefined || !isSignedOut || toLogIn) {
    return (
      <StandaloneLoading onRetry={retry}>
        <SignUpSkeleton />
      </StandaloneLoading>
    );
  }
  // Accepted by an account that has since been deleted: nothing left to sign up with.
  if (invitation.data.status === "accepted") return <InvalidInvitation />;
  return <SignUpForm token={token} invitation={invitation.data} />;
}

/**
 * 2's sign-up from an invitation (design-spec 6.16, pattern B): the invitation's address,
 * fixed, a display name and a password (U5), or Google with the same address. The new
 * account is signed in and goes on to 3.
 */
function SignUpForm({
  token,
  invitation,
}: {
  token: string;
  invitation: InvitationPreview;
}) {
  const { t } = useTranslation(["auth", "app", "errors"]);
  useDocumentTitle(t("auth:signUp.title"));
  const formId = useId();
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<{
    error: unknown;
    retry: "form" | "google";
  } | null>(null);
  const start = useCallback(() => {
    setFailure(null);
    return continueWithGoogle({
      callbackURL: welcomeHref(token),
      errorCallbackURL: "/login",
      invitationToken: token,
    });
  }, [token]);
  const onGoogleFailure = useCallback(
    (cause: unknown) => setFailure({ error: cause, retry: "google" }),
    [],
  );
  const { isStarting: isGoogleStarting, startGoogle } = useGoogleStart(
    start,
    onGoogleFailure,
  );
  const rejections = useRejectedFields(["displayName", "password"] as const);
  const oneAtATime = useOneAtATime();
  const form = useAppForm({
    defaultValues: { displayName: "", password: "" },
    listeners: {
      onChange: ({ fieldApi }) => rejections.clear(fieldApi.name),
    },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        setFailure(null);
        rejections.clear();
        let me: Me;
        try {
          ({ me } = await unwrap(
            api()
              .api.v1.invitations["by-token"]({ token: inPath(token) })
              ["sign-up"].post({ ...value, timezone: deviceTimeZone() }),
          ));
        } catch (cause) {
          if (failureCode(cause) === "EMAIL_TAKEN") {
            // An account was made with the address meanwhile: the link now leads to
            // Log in (U4), then back here for ①.
            await queryClient.invalidateQueries({
              queryKey: invitationQuery(token).queryKey,
            });
            return;
          }
          if (!rejections.reject(cause)) {
            setFailure({ error: cause, retry: "form" });
          }
          return;
        }
        queryClient.setQueryData(meQuery().queryKey, me);
        await navigate({ href: welcomeHref(token), replace: true });
        // A new session: nothing cached from before it stays (SDD 8.2) but the account
        // and the invitation 3 shows. Dropped once this screen is gone, which would
        // otherwise ask again who is signed in and leave for ① without the steps of a
        // new account.
        dropAllBut(queryClient, [
          meQuery().queryKey,
          invitationQuery(token).queryKey,
        ]);
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
            <Heading level={1}>{t("auth:signUp.title")}</Heading>
          </Stack>
        }
        actions={
          <form.AppForm>
            <form.SubmitButton
              form={formId}
              isDisabled={!isOnline || isGoogleStarting}
            >
              {t("auth:signUp.submit")}
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
            aria-label={t("auth:signUp.title")}
            onSubmit={() => void form.handleSubmit()}
          >
            <TextField
              label={t("auth:email")}
              type="email"
              value={invitation.email}
              autoComplete="username"
              isReadOnly
              width="full"
            />
            <form.AppField
              name="displayName"
              validators={{
                onMount: displayNameSchema,
                onChange: displayNameSchema,
              }}
            >
              {(field) => (
                <field.TextField
                  rejection={rejections.rejectionOf("displayName")}
                  label={t("auth:signUp.displayName")}
                  autoComplete="name"
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
                  rejection={rejections.rejectionOf("password")}
                  label={t("auth:password")}
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
            error={failure.error}
            messages={{ INVITATION_INVALID: t("errors:INVITATION_INVALID") }}
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
