import {
  displayNameSchema,
  type InvitationPreview,
  type Me,
  sameEmail,
} from "@moonx/schemas";
import {
  Button,
  Form,
  Heading,
  InlineAlert,
  Stack,
  Steps,
  StepsPattern,
  Text,
  ToastQueue,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { InvalidInvitation } from "../components/InvalidInvitation";
import { useFailureOnceClosed } from "../components/ideaActions";
import { useLogOut } from "../components/logOut";
import { PhotoField } from "../components/PhotoField";
import { failureCode, SendFailure } from "../components/SendFailure";
import { StandaloneFrame } from "../components/StandaloneFrame";
import { StandaloneLoading } from "../components/StandaloneLoading";
import { FailureState } from "../components/states";
import { dashboardHref } from "../components/workspace";
import { deviceTimeZone } from "../lib/account";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import { useAppForm, useOneAtATime, useRejectedFields } from "../lib/form";
import { useIsMounted } from "../lib/mounted";
import { useIsOnline } from "../lib/online";
import { invitationQuery, isInvitationToken, meQuery } from "../lib/queries";
import { askAgain } from "../lib/query";
import { useSendThrough } from "../lib/send";
import { useDocumentTitle } from "../lib/title";
import { WelcomeSkeleton } from "./WelcomeSkeleton";

/** 3's steps (design-spec 6.16): ① the invitation, ② the profile, ③ done. */
export type WelcomeStep = "invite" | "profile" | "done";

/** `/welcome`'s search parameters (SDD 4章). */
export interface WelcomeSearch {
  step?: WelcomeStep;
  /** The invitation's token: its ① and the workspace 5 opens. */
  token?: string;
  /** `1`: just signed up from the invitation, so ② and ③ follow ①. */
  new?: 1;
}

/** How long the toasts that see the user on to 5 stay (Spectrum's minimum). */
const TOAST_MS = 5000;

/**
 * The steps of this visit (design-spec 6.16 3, SDD 4章 `/welcome`): a new account from an
 * invitation to a workspace goes ① ② ③, one from an invitation without a workspace ② ③
 * (signing up accepted it), and an account that was there already ① alone.
 */
export function stepsOf(
  invitation: InvitationPreview | undefined,
  isNew: boolean,
): WelcomeStep[] {
  if (invitation === undefined) return ["profile", "done"];
  if (!isNew) return ["invite"];
  return invitation.workspace === null
    ? ["profile", "done"]
    : ["invite", "profile", "done"];
}

/** The 5 the steps end on: the invitation's workspace once the user is in it, else theirs. */
function dashboardAfter(me: Me, invitation: InvitationPreview | undefined) {
  const id = invitation?.workspace?.id;
  return id !== undefined &&
    me.memberships.some(({ workspace }) => workspace.id === id)
    ? `/w/${id}`
    : (dashboardHref(me) ?? "/");
}

/**
 * 3 Welcome (design-spec 6.16, pattern G): accepting the invitation, the profile, and the
 * way to 5. The steps shown are only those of this visit.
 */
export function WelcomeScreen({ step, token, new: fresh }: WelcomeSearch) {
  const { t } = useTranslation(["auth"]);
  useDocumentTitle(t("auth:welcome.title"));
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery());
  const isToken = token !== undefined && isInvitationToken(token);
  const invitationOptions = invitationQuery(token ?? "");
  const invitation = useQuery({
    ...invitationOptions,
    enabled: isToken,
  });
  if (me === undefined) return null;
  if (token !== undefined) {
    if (!isToken) return <InvalidInvitation />;
    if (invitation.isError) {
      const { error } = invitation;
      if (error instanceof ApiError && error.code === "INVITATION_INVALID") {
        return <InvalidInvitation />;
      }
      return (
        <StandaloneFrame>
          <FailureState
            error={error}
            onRetry={() =>
              void queryClient.invalidateQueries({
                queryKey: ["invitations", token],
              })
            }
            dashboardHref={dashboardHref(me)}
          />
        </StandaloneFrame>
      );
    }
    if (invitation.data === undefined) {
      return (
        <StandaloneLoading
          onRetry={() => askAgain(queryClient, [invitationOptions])}
        >
          <WelcomeSkeleton />
        </StandaloneLoading>
      );
    }
  }
  const flow = stepsOf(invitation.data, fresh === 1);
  const current = step !== undefined && flow.includes(step) ? step : flow[0];
  return (
    <WelcomeSteps
      me={me}
      token={token}
      invitation={invitation.data}
      flow={flow}
      current={current ?? "profile"}
    />
  );
}

function WelcomeSteps({
  me,
  token,
  invitation,
  flow,
  current,
}: {
  me: Me;
  token: string | undefined;
  invitation: InvitationPreview | undefined;
  flow: WelcomeStep[];
  current: WelcomeStep;
}) {
  const { t } = useTranslation(["auth"]);
  const navigate = useNavigate();
  const next = flow[flow.indexOf(current) + 1];
  // The next step replaces this one: Back must not offer to join or send again.
  const toNext = () =>
    void navigate({
      to: ".",
      search: (previous: WelcomeSearch) => ({ ...previous, step: next }),
      replace: true,
    });
  const steps = (
    <Steps
      aria-label={t("auth:welcome.steps")}
      steps={flow.map((id) => ({ id, label: t(`auth:welcome.step.${id}`) }))}
      currentId={current}
      doneLabel={t("auth:welcome.stepDone")}
    />
  );
  if (current === "invite" && invitation !== undefined && token !== undefined) {
    return (
      <InviteStep
        me={me}
        token={token}
        invitation={invitation}
        steps={steps}
        onJoined={next === undefined ? undefined : toNext}
      />
    );
  }
  if (current === "profile") {
    return <ProfileStep me={me} steps={steps} onSaved={toNext} />;
  }
  return <DoneStep steps={steps} dashboard={dashboardAfter(me, invitation)} />;
}

function WelcomePage({
  steps,
  actions,
  children,
}: {
  steps: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation(["auth", "app"]);
  return (
    <StandaloneFrame>
      <StepsPattern
        header={
          <Stack gap="space-75">
            <Text variant="caption" tone="secondary">
              {t("app:name")}
            </Text>
            <Heading level={1}>{t("auth:welcome.title")}</Heading>
          </Stack>
        }
        steps={steps}
        actions={actions}
      >
        {children}
      </StepsPattern>
    </StandaloneFrame>
  );
}

/** ①'s one line: who invited the user where, as what (the invitation mail's words). */
function useInvitationLine(invitation: InvitationPreview): string {
  const { t } = useTranslation(["auth", "common"]);
  const inviter = invitation.invitedBy?.displayName;
  const { workspace, role } = invitation;
  if (workspace === null) {
    return inviter === undefined
      ? t("auth:welcome.invitedNoWorkspace")
      : t("auth:welcome.invitedByNoWorkspace", { inviter });
  }
  const values = {
    workspace: workspace.name,
    role: role === null ? "" : t(`common:role.${role}`),
  };
  return inviter === undefined
    ? t("auth:welcome.invited", values)
    : t("auth:welcome.invitedBy", { ...values, inviter });
}

/**
 * ① The invitation (U4) and Join (U6). Signed in with another address, the invitation's
 * address and Log out, which comes back to the link (design-spec 6.16 3「状態とエラー」).
 * Accepted already, or a member already: the toast says so and 5 opens. Once 3 is left
 * while Join is on its way, a join that goes through moves nowhere (a member already
 * still says so), and a failure says so in a toast: ①'s words for a refusal, else as a
 * row's send does, whose Retry joins again (6.0.6「送っている間に閉じた送信の失敗」).
 */
function InviteStep({
  me,
  token,
  invitation,
  steps,
  onJoined,
}: {
  me: Me;
  token: string;
  invitation: InvitationPreview;
  steps: ReactNode;
  /** The next step of a new account; without one, Join goes on to 5. */
  onJoined?: () => void;
}) {
  const { t } = useTranslation(["auth", "common", "errors", "app"]);
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logOut = useLogOut(`/invite/${token}`);
  const [isJoining, setJoining] = useState(false);
  const busy = useRef(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [mismatch, setMismatch] = useState<string | null>(
    sameEmail(me.email, invitation.email) ? null : invitation.email,
  );
  const [isInvalid, setInvalid] = useState(false);
  const line = useInvitationLine(invitation);
  const isShown = useIsMounted();
  const sendThrough = useSendThrough();
  /**
   * The user as the API has them now, to tell where 5 is; the one known already if the
   * API cannot say. Joining has happened by then and is not repeated.
   */
  const freshMe = () =>
    queryClient
      .fetchQuery({ ...meQuery(), staleTime: 0 })
      .catch(() => queryClient.getQueryData(meQuery().queryKey) ?? me);
  /**
   * Opens 5 in place of 3 (Back must not offer to join again), with the toast; once 3 is
   * gone, the toast alone.
   */
  const toDashboard = async (user: Me, message: string | null) => {
    if (message !== null) {
      ToastQueue.neutral(message, { timeout: TOAST_MS });
    }
    if (!isShown.current) return;
    await navigate({ href: dashboardAfter(user, invitation), replace: true });
  };
  /** The address the invitation went to, as a refusal of another one names it. */
  const invitedEmailOf = (error: unknown) =>
    error instanceof ApiError && typeof error.detail.invitedEmail === "string"
      ? error.detail.invitedEmail
      : invitation.email;
  /**
   * Joins (U6), and the user as the API has them then. The workspace joined becomes the
   * one the next sign-in opens (5章「ログイン後」: the invitation's at first), though the
   * user may stop before its 5.
   */
  const accept = async () => {
    const { workspaceId, alreadyMember } = await sendThrough(() =>
      unwrap(
        api()
          .api.v1.invitations["by-token"]({ token: inPath(token) })
          .accept.post(),
      ),
    );
    const user =
      workspaceId === null || alreadyMember
        ? await freshMe()
        : await unwrap(api().api.v1.me.patch({ lastWorkspaceId: workspaceId }))
            .then((updated) => {
              queryClient.setQueryData(meQuery().queryKey, updated);
              return updated;
            })
            .catch(freshMe);
    return { user, alreadyMember };
  };
  const failedOnceLeft = useFailureOnceClosed(
    async () => {
      const { alreadyMember } = await accept();
      if (alreadyMember) {
        ToastQueue.neutral(t("auth:welcome.alreadyMember"), {
          timeout: TOAST_MS,
        });
      }
    },
    (error) => {
      switch (failureCode(error)) {
        case "INVITATION_ALREADY_ACCEPTED":
          // Accepted, so the user may be in the workspace by now.
          void queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
          return t("errors:INVITATION_ALREADY_ACCEPTED");
        case "INVITATION_EMAIL_MISMATCH":
          return t("errors:INVITATION_EMAIL_MISMATCH", {
            email: invitedEmailOf(error),
          });
        case "INVITATION_INVALID":
          return t("errors:INVITATION_INVALID");
        default:
          return null;
      }
    },
  );
  const join = async () => {
    if (busy.current) return;
    busy.current = true;
    setJoining(true);
    setFailure(null);
    try {
      let joined: Awaited<ReturnType<typeof accept>>;
      try {
        joined = await accept();
      } catch (cause) {
        failedOnceLeft(cause, undefined);
        if (!isShown.current) return;
        const code = failureCode(cause);
        if (code === "INVITATION_ALREADY_ACCEPTED") {
          await toDashboard(
            await freshMe(),
            t("errors:INVITATION_ALREADY_ACCEPTED"),
          );
        } else if (code === "INVITATION_EMAIL_MISMATCH") {
          setMismatch(invitedEmailOf(cause));
        } else if (code === "INVITATION_INVALID") {
          setInvalid(true);
        } else {
          setFailure(cause);
        }
        return;
      }
      const { user, alreadyMember } = joined;
      if (onJoined !== undefined && !alreadyMember) {
        if (isShown.current) onJoined();
      } else {
        await toDashboard(
          user,
          alreadyMember ? t("auth:welcome.alreadyMember") : null,
        );
      }
    } finally {
      busy.current = false;
      setJoining(false);
    }
  };
  // Used already, by this address: "Already accepted" and 5, without a Join that could
  // only say so (design-spec 6.16 3). Another address is told to log in with the right one.
  const isAccepted = invitation.status === "accepted" && mismatch === null;
  const leftAccepted = useRef(false);
  useEffect(() => {
    if (!isAccepted || leftAccepted.current) return;
    leftAccepted.current = true;
    // Nothing was sent: left meanwhile, 3 says nothing more.
    void freshMe().then((user) => {
      if (isShown.current) {
        void toDashboard(user, t("errors:INVITATION_ALREADY_ACCEPTED"));
      }
    });
  });
  if (isInvalid) return <InvalidInvitation />;
  return (
    <WelcomePage
      steps={steps}
      actions={
        mismatch === null ? (
          <Button
            variant="primary"
            onPress={() => void join()}
            isPending={isJoining || isAccepted}
            isDisabled={!isOnline}
          >
            {t("auth:welcome.join")}
          </Button>
        ) : (
          <Button variant="secondary" onPress={logOut} isDisabled={!isOnline}>
            {t("app:nav.logOut")}
          </Button>
        )
      }
    >
      {mismatch === null ? (
        <Text variant="body-long">{line}</Text>
      ) : (
        <InlineAlert variant="notice">
          {t("errors:INVITATION_EMAIL_MISMATCH", { email: mismatch })}
        </InlineAlert>
      )}
      {failure !== null && (
        <SendFailure
          error={failure}
          transient="couldNotSave"
          onRetry={() => void join()}
          isRetryDisabled={!isOnline}
        />
      )}
    </WelcomePage>
  );
}

/** What ② saves with Continue (U2). */
interface ProfileInput {
  displayName: string;
  timezone: string;
}

/**
 * ② The profile (design-spec 6.16 3): the display name, which sign-up gave, and an
 * optional photo (U3, saved as soon as it is chosen); the time zone is the device's. Continue
 * saves the name and the zone (U2). Once 3 is left while Continue is on its way, a save
 * that goes through moves nowhere, and a failure says so in a toast, whose Retry sends the
 * same name and zone again (6.0.6「送っている間に閉じた送信の失敗」).
 */
function ProfileStep({
  me,
  steps,
  onSaved,
}: {
  me: Me;
  steps: ReactNode;
  onSaved: () => void;
}) {
  const { t } = useTranslation(["auth"]);
  const formId = useId();
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<unknown>(null);
  const rejections = useRejectedFields(["displayName"] as const);
  const oneAtATime = useOneAtATime();
  const isShown = useIsMounted();
  const sendThrough = useSendThrough();
  const save = async (input: ProfileInput) => {
    const updated = await sendThrough(() =>
      unwrap(api().api.v1.me.patch(input)),
    );
    queryClient.setQueryData(meQuery().queryKey, updated);
  };
  // The name refused by its rule (6.0.8), whose field said "Check the format", reads
  // "Couldn't save. Check the format." as any refusal of the format does.
  const failedOnceLeft = useFailureOnceClosed(save);
  const form = useAppForm({
    defaultValues: { displayName: me.displayName },
    listeners: {
      onChange: ({ fieldApi }) => rejections.clear(fieldApi.name),
    },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        setFailure(null);
        rejections.clear();
        const input: ProfileInput = {
          displayName: value.displayName,
          timezone: deviceTimeZone(),
        };
        try {
          await save(input);
        } catch (cause) {
          failedOnceLeft(cause, input);
          if (!rejections.reject(cause)) setFailure(cause);
          return;
        }
        if (isShown.current) onSaved();
      }),
  });
  return (
    <WelcomePage
      steps={steps}
      actions={
        <form.AppForm>
          <form.SubmitButton form={formId} isDisabled={!isOnline}>
            {t("auth:welcome.continue")}
          </form.SubmitButton>
        </form.AppForm>
      }
    >
      <form.AppForm>
        <Form
          id={formId}
          aria-label={t("auth:welcome.step.profile")}
          onSubmit={() => void form.handleSubmit()}
        >
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
                label={t("auth:welcome.displayName")}
                autoComplete="name"
                isRequired
                isReadOnly={!isOnline}
                width="full"
              />
            )}
          </form.AppField>
        </Form>
      </form.AppForm>
      <PhotoField me={me} />
      {failure !== null && (
        <SendFailure
          error={failure}
          transient="couldNotSave"
          onRetry={() => void form.handleSubmit()}
          isRetryDisabled={!isOnline}
        />
      )}
    </WelcomePage>
  );
}

/** ③ Done, and the way to the invitation's workspace (design-spec 6.16 3). */
function DoneStep({
  steps,
  dashboard,
}: {
  steps: ReactNode;
  dashboard: string;
}) {
  const { t } = useTranslation(["auth", "app"]);
  const navigate = useNavigate();
  return (
    <WelcomePage
      steps={steps}
      actions={
        <Button
          variant="primary"
          onPress={() => void navigate({ href: dashboard, replace: true })}
        >
          {t("app:state.toDashboard")}
        </Button>
      }
    >
      <Heading level={2}>{t("auth:welcome.doneTitle")}</Heading>
    </WelcomePage>
  );
}
