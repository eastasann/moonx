import type { InvitationPreview, Me } from "@moonx/schemas";
import {
  Badge,
  Button,
  Divider,
  FocusPattern,
  Form,
  Heading,
  InlineAlert,
  Link,
  PageFrame,
  Skeleton,
  Stack,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { QueryBoundary } from "../components/states";
import { signUpSchema } from "../forms/schemas";
import { api, call } from "../lib/api";
import { isApiError } from "../lib/api-error";
import { authCall, authClient } from "../lib/auth-client";
import { errorText } from "../lib/error-text";
import { fieldProps, validate } from "../lib/form";
import { invitationQuery, welcomeInvitePath } from "../lib/invitation";
import { useGoTo } from "../lib/navigate";
import { dropUserQueries, ME_KEY } from "../lib/session";
import { deviceTimezone } from "../lib/timezones";

/** The frame every state of this screen shares: pattern B, with the main action pinned on mobile. */
function InviteFrame({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const { t } = useTranslation("auth");
  return (
    <PageFrame>
      <FocusPattern
        hasTabBar={false}
        header={<Heading level={1}>{t("invite.title")}</Heading>}
        actions={actions}
      >
        {children}
      </FocusPattern>
    </PageFrame>
  );
}

function SignUpForm({ token, invitation }: { token: string; invitation: InvitationPreview }) {
  const { t } = useTranslation(["auth", "app", "account"]);
  const formId = useId();
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const [googleError, setGoogleError] = useState<unknown>(null);

  const signUp = useMutation({
    // U5 answers with a bare Response so that it can set the session cookie, which leaves Treaty
    // no body type to infer.
    mutationFn: async (value: { displayName: string; password: string }) => {
      const answer = await call(
        api()
          .api.v1.invitations["by-token"]({ token })
          ["sign-up"].post({
            ...value,
            displayName: value.displayName.trim(),
            timezone: deviceTimezone(),
          }),
      );
      return answer as unknown as { me: Me };
    },
    onSuccess: ({ me }) => {
      dropUserQueries(queryClient);
      queryClient.setQueryData(ME_KEY, me);
      goTo(invitation.workspace ? welcomeInvitePath(token, true) : "/welcome?step=profile");
    },
  });
  const google = useMutation({
    mutationFn: () =>
      authCall(
        authClient().signIn.social({
          provider: "google",
          requestSignUp: true,
          callbackURL: welcomeInvitePath(token, true),
          errorCallbackURL: "/login",
        }),
      ),
    onError: setGoogleError,
  });
  const form = useForm({
    defaultValues: { displayName: "", password: "" },
    validators: { onSubmit: validate(signUpSchema, t) },
    onSubmit: ({ value }) => signUp.mutateAsync(value).catch(() => {}),
  });
  const failure = signUp.error ?? googleError;

  return (
    <InviteFrame
      actions={
        <Button
          type="submit"
          form={formId}
          variant="accent"
          isPending={signUp.isPending}
          pendingLabel={t("app:saving")}
        >
          {t("auth:invite.submit")}
        </Button>
      }
    >
      <Stack gap="space-300">
        {invitation.workspace ? (
          <Stack gap="space-100">
            <Text variant="body-long">
              {t("auth:invite.joining", { workspace: invitation.workspace.name })}
            </Text>
            {invitation.role ? <Badge>{t(`account:role.${invitation.role}`)}</Badge> : null}
            {invitation.invitedBy ? (
              <Text variant="body-sm" tone="secondary">
                {t("auth:invite.invitedBy", { name: invitation.invitedBy.displayName })}
              </Text>
            ) : null}
          </Stack>
        ) : null}
        {isApiError(signUp.error) && signUp.error.code === "EMAIL_TAKEN" ? (
          <InlineAlert variant="negative" heading={t("auth:invite.emailTaken")}>
            <Link href={`/login?next=${encodeURIComponent(welcomeInvitePath(token))}`}>
              {t("auth:invite.logIn")}
            </Link>
          </InlineAlert>
        ) : failure ? (
          <InlineAlert variant="negative" heading={errorText(t, failure)} />
        ) : null}
        <Form
          id={formId}
          aria-label={t("auth:invite.title")}
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <TextField label={t("auth:fields.email")} value={invitation.email} isReadOnly />
          <form.Field name="displayName">
            {(field) => (
              <TextField
                label={t("auth:fields.displayName")}
                autoComplete="name"
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
                autoComplete="new-password"
                description={t("auth:fields.passwordRule")}
                isRequired
                {...fieldProps(field)}
              />
            )}
          </form.Field>
        </Form>
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
    </InviteFrame>
  );
}

/** What the person sees once the invitation is read: where else to go, or the wait for the login. */
function InviteNotice({ token, invitation }: { token: string; invitation: InvitationPreview }) {
  const { t } = useTranslation("auth");
  const goTo = useGoTo();
  const hasAccount = invitation.accountExists;
  useEffect(() => {
    if (hasAccount && invitation.status === "pending") {
      goTo(`/login?next=${encodeURIComponent(welcomeInvitePath(token))}`, { replace: true });
    }
  }, [hasAccount, invitation.status, token, goTo]);

  if (invitation.status === "accepted") {
    return (
      <Stack gap="space-200" align="start">
        <InlineAlert variant="informative" heading={t("invite.accepted")} />
        <Link href="/login">{t("backToLogin")}</Link>
      </Stack>
    );
  }
  return <Skeleton shape="block" height="space-700" />;
}

/**
 * Screen 2, sign up from an invitation link (design-spec 6.16). Someone already signed in never
 * gets here: the route sends them to step 1 of the welcome flow.
 */
export function Invite({ token }: { token: string }) {
  const query = useQuery(invitationQuery(token));
  const invitation = query.data;
  if (invitation?.status === "pending" && !invitation.accountExists) {
    return <SignUpForm token={token} invitation={invitation} />;
  }
  return (
    <InviteFrame>
      <QueryBoundary
        query={query}
        skeleton={
          <Stack gap="space-300">
            <Skeleton shape="block" height="space-700" />
            <Skeleton shape="block" height="space-700" />
          </Stack>
        }
      >
        {(data) => <InviteNotice token={token} invitation={data} />}
      </QueryBoundary>
    </InviteFrame>
  );
}
