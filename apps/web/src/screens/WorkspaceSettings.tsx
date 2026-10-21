import { formatCurrencyOption, formatDate } from "@moonx/i18n";
import {
  CURRENCY_CODES,
  currencySchema,
  emailSchema,
  type Invitation,
  type Me,
  type Member,
  type Role,
  roleSchema,
  type WorkspaceUpdate,
  workspaceNameSchema,
} from "@moonx/schemas";
import {
  ActionMenu,
  AlertDialog,
  Avatar,
  Breadcrumb,
  Breadcrumbs,
  Button,
  Flex,
  Form,
  Heading,
  InlineAlert,
  MenuItem,
  Picker,
  SegmentedControl,
  SegmentedControlItem,
  SettingsFieldRow,
  SettingsList,
  SettingsListItem,
  SettingsPattern,
  Skeleton,
  Stack,
  Text,
  TextField,
  ToastQueue,
} from "@moonx/ui-web";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LeaveWorkspaceDialog } from "../components/LeaveWorkspaceDialog";
import { type RowFieldsSpec, useRowFields } from "../components/RowFields";
import { SaveFailureNote } from "../components/SaveFeedback";
import { failureCode, SendFailure } from "../components/SendFailure";
import {
  FailureState,
  NoAccessState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import {
  dashboardHref,
  ownPersonalId,
  useWorkspace,
} from "../components/workspace";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import type { SaveTarget } from "../lib/autosave";
import { useAppForm, useOneAtATime, useRejectedFields } from "../lib/form";
import { ruleErrorOf } from "../lib/input-issues";
import { useIsOnline } from "../lib/online";
import {
  invitationsQuery,
  membersQuery,
  meQuery,
  workspaceKey,
} from "../lib/queries";
import { isSessionLost, useSendThrough } from "../lib/send";
import { useDocumentTitle } from "../lib/title";

/** How long the toasts of 9 stay (Spectrum's minimum). */
const TOAST_MS = 5000;

const ROLES = ["owner", "member", "viewer"] as const satisfies readonly Role[];

/** Owner, Member and Viewer, in the order 2.1 ranks them, for the role Pickers. */
function useRoleItems() {
  const { t } = useTranslation(["common"]);
  return ROLES.map((role) => ({ id: role, label: t(`common:role.${role}`) }));
}

interface WorkspaceValues {
  name: string;
  currency: string;
}

const workspaceSpec: RowFieldsSpec<WorkspaceValues> = {
  errorOf: (field, value) =>
    ruleErrorOf(field === "name" ? workspaceNameSchema : currencySchema, value),
  toWire: (_, value) => value,
  fromWire: (_, value) => String(value ?? ""),
  isChoice: (field) => field === "currency",
};

/** The save item of 9's name and currency (W1 PATCH); the header's "Saved" counts it. */
const workspaceItemKey = (workspaceId: string) => `workspace:${workspaceId}`;

/**
 * W1 PATCH as a save item. A workspace carries no version (SDD 5.5), so every send goes
 * with 0 and leaves 0, and W1 never answers a conflict: `loadTheirs` only reads the user
 * again, whose memberships carry the name and currency the screens show.
 */
function workspaceTarget(
  queryClient: QueryClient,
  workspaceId: string,
  noun: string,
): SaveTarget {
  return {
    key: workspaceItemKey(workspaceId),
    noun,
    send: async (fields) => {
      const updated = await unwrap(
        api()
          .api.v1.workspaces({ workspaceId })
          .patch(fields as WorkspaceUpdate),
      );
      queryClient.setQueryData(meQuery().queryKey, (me: Me | undefined) =>
        me === undefined
          ? me
          : {
              ...me,
              memberships: me.memberships.map((membership) =>
                membership.workspace.id === workspaceId
                  ? {
                      ...membership,
                      // Only what this save sent, as on 4 (Account.tsx meTarget).
                      workspace: {
                        ...membership.workspace,
                        ...("name" in fields ? { name: updated.name } : {}),
                        ...("currency" in fields
                          ? { currency: updated.currency }
                          : {}),
                      },
                    }
                  : membership,
              ),
            },
      );
      return 0;
    },
    loadTheirs: () =>
      void queryClient.invalidateQueries({ queryKey: meQuery().queryKey }),
  };
}

/** 9's skeleton: its three groups in the shape of their fields and rows. */
export function WorkspaceSettingsSkeleton() {
  const { t } = useTranslation(["settings"]);
  return (
    <SettingsPattern
      header={
        <Heading level={1} variant="heading-1-settings">
          {t("settings:workspace.title")}
        </Heading>
      }
      groups={[
        {
          id: "workspace",
          title: t("settings:workspace.workspace.title"),
          content: (
            <>
              <TextField label={t("settings:workspace.workspace.name")} />
              <TextField label={t("settings:workspace.workspace.currency")} />
            </>
          ),
        },
        {
          id: "members",
          title: t("settings:workspace.members.title"),
          content: <MembersSkeleton />,
        },
        {
          id: "invitations",
          title: t("settings:workspace.invitations.title"),
          content: (
            <SettingsFieldRow>
              <TextField
                aria-label={t("settings:workspace.invitations.email")}
              />
              <TextField
                aria-label={t("settings:workspace.invitations.role")}
              />
              <Button variant="primary">
                {t("settings:workspace.invitations.send")}
              </Button>
            </SettingsFieldRow>
          ),
        },
      ]}
    />
  );
}

function MembersSkeleton() {
  const { t } = useTranslation(["settings"]);
  return (
    <SettingsList aria-label={t("settings:workspace.members.list")}>
      {[0, 1, 2].map((row) => (
        <SettingsListItem
          key={row}
          avatar={<Avatar name="" size="M" />}
          title={t("settings:workspace.members.title")}
          description={t("settings:workspace.invitations.emailPlaceholder")}
        />
      ))}
    </SettingsList>
  );
}

/**
 * 9 Workspace Settings (design-spec 6.16, pattern H, s09-settings.html): the name and
 * currency, saved as they change; the members with their roles and Remove; the
 * invitations, sent, resent and cancelled. Owners only: anyone else is told they have no
 * access (6.0.6), as the API refuses them.
 */
export function WorkspaceSettingsScreen() {
  const { t } = useTranslation(["settings"]);
  const { me, workspace, role } = useWorkspace();
  const isOwner = role === "owner";
  useDocumentTitle(
    ...(isOwner ? [t("settings:workspace.title"), workspace.name] : []),
  );
  return (
    <WorkspaceFrame
      current="settings"
      saveScope={workspaceItemKey(workspace.id)}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb>{t("settings:workspace.title")}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      {isOwner ? (
        <SettingsPattern
          header={
            <Heading level={1} variant="heading-1-settings">
              {t("settings:workspace.title")}
            </Heading>
          }
          groups={[
            {
              id: "workspace",
              title: t("settings:workspace.workspace.title"),
              description: (
                <Text variant="body-sm" tone="secondary">
                  {t("settings:savesOnTheirOwn")}
                </Text>
              ),
              content: <WorkspaceFields />,
            },
            {
              id: "members",
              title: t("settings:workspace.members.title"),
              description: <MembersLead workspaceId={workspace.id} />,
              content: <MemberList />,
            },
            {
              id: "invitations",
              title: t("settings:workspace.invitations.title"),
              description: (
                <Text variant="body-sm" tone="secondary">
                  {t("settings:workspace.invitations.lead")}
                </Text>
              ),
              content: <Invitations />,
            },
          ]}
        />
      ) : (
        <NoAccessState dashboardHref={dashboardHref(me)} />
      )}
    </WorkspaceFrame>
  );
}

/**
 * The name, saved as it is typed (6.0.2; against its rule (6.0.8) it is not sent and says
 * why), and the currency, saved when chosen, warned that amounts are not converted.
 */
function WorkspaceFields() {
  const { t } = useTranslation(["settings"]);
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const target = useMemo(
    () =>
      workspaceTarget(
        queryClient,
        workspace.id,
        t("settings:workspace.workspace.nameNoun"),
      ),
    [queryClient, workspace.id, t],
  );
  const fields = useRowFields(
    target,
    0,
    { name: workspace.name, currency: workspace.currency },
    workspaceSpec,
  );
  const currencies = useMemo(
    () =>
      CURRENCY_CODES.map((code) => ({
        id: code,
        label: formatCurrencyOption(code),
      })),
    [],
  );
  return (
    <>
      <TextField
        label={t("settings:workspace.workspace.name")}
        value={fields.values.name}
        onChange={(value) => fields.change("name", value)}
        onBlur={() => fields.blur("name")}
        errorMessage={fields.errors.name}
        isRequired
        isReadOnly={!isOnline}
      />
      <Picker
        label={t("settings:workspace.workspace.currency")}
        items={currencies}
        value={fields.values.currency}
        onChange={(value) => {
          if (value !== null) fields.change("currency", value);
        }}
        description={t("settings:workspace.workspace.currencyNote")}
        descriptionTone="notice"
        errorMessage={fields.errors.currency}
        isRequired
        isDisabled={!isOnline}
      />
      <SaveFailureNote itemKey={workspaceItemKey(workspace.id)} />
    </>
  );
}

/** "4 people. Owners can invite and change roles." once the members are read. */
function MembersLead({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["settings"]);
  const { data } = useQuery(membersQuery(workspaceId));
  if (data === undefined) return null;
  return (
    <Text variant="body-sm" tone="secondary">
      {t("settings:workspace.members.lead", { count: data.items.length })}
    </Text>
  );
}

/** A change to a member waiting for its question to be answered. */
type MemberQuestion =
  | { kind: "role"; member: Member; role: Role }
  | { kind: "remove"; member: Member }
  | { kind: "leave" };

/** Why a member's role and ⋯ cannot be used (design-spec 1.3・6.16 9), or null. */
const lockOf = (member: Member, owners: number) =>
  member.isPersonalOwner
    ? ("personalOwner" as const)
    : member.role === "owner" && owners <= 1
      ? ("lastOwner" as const)
      : null;

/**
 * The members (W2), each with their role's Picker and ⋯ (Remove; Leave on the user's
 * own row). The only Owner and the owner of a personal workspace keep theirs, shown
 * unavailable with why. A role is saved when chosen; making someone a Viewer, making
 * oneself less than Owner and removing ask first, for what they undo (6.16's table).
 */
function MemberList() {
  const { t } = useTranslation(["settings", "common", "app"]);
  const { me, workspace } = useWorkspace();
  const workspaceId = workspace.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOnline = useIsOnline();
  const query = useQuery(membersQuery(workspaceId));
  const isSlow = useIsSlow(query.isPending);
  const sendThrough = useSendThrough();
  const [question, setQuestion] = useState<MemberQuestion | null>(null);
  const [sending, setSending] = useState<{
    userId: string;
    role?: Role;
  } | null>(null);
  const busy = useRef(false);
  const [failure, setFailure] = useState<{
    error: unknown;
    retry: () => void;
  } | null>(null);
  const roles = useRoleItems();

  const putMembers = (update: (items: Member[]) => Member[]) =>
    queryClient.setQueryData(membersQuery(workspaceId).queryKey, (list) =>
      list === undefined ? list : { items: update(list.items) },
    );
  /**
   * A refusal that means the list or the user's role is out of date: read again what it
   * concerns (another Owner left, was demoted or removed someone meanwhile).
   */
  const refreshOn = (error: unknown) => {
    const isStale =
      error instanceof ApiError &&
      (error.status === 403 ||
        error.status === 404 ||
        error.code === "LAST_OWNER" ||
        error.code === "PERSONAL_OWNER");
    if (!isStale) return;
    void queryClient.invalidateQueries({
      queryKey: membersQuery(workspaceId).queryKey,
    });
    if (error.status === 403) {
      void queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
    }
  };
  /** Sends one change at a time; a failure stays under the list with Retry. */
  const send = async (
    target: { userId: string; role?: Role },
    request: () => Promise<void>,
    retry: () => void,
  ) => {
    if (busy.current) return;
    busy.current = true;
    setSending(target);
    setFailure(null);
    try {
      await sendThrough(request);
    } catch (error) {
      if (!isSessionLost(error)) setFailure({ error, retry });
      refreshOn(error);
    } finally {
      busy.current = false;
      setSending(null);
    }
  };
  const changeRole = (member: Member, role: Role): Promise<void> =>
    send(
      { userId: member.user.id, role },
      async () => {
        const updated = await unwrap(
          api()
            .api.v1.workspaces({ workspaceId })
            .members({ userId: member.user.id })
            .patch({ role }),
        );
        putMembers((items) =>
          items.map((item) =>
            item.user.id === updated.user.id ? updated : item,
          ),
        );
        // A Viewer's self analysis is no longer shared here (6.16's table).
        void queryClient.invalidateQueries({
          queryKey: [...workspaceKey(workspaceId), "dashboard"],
        });
        if (member.user.id === me.id) {
          // No longer an Owner: 9 is not theirs to open (2.2).
          await navigate({ href: `/w/${workspaceId}` });
          await queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
        }
      },
      () => void changeRole(member, role),
    );
  const remove = (member: Member): Promise<void> =>
    send(
      { userId: member.user.id },
      async () => {
        await unwrap(
          api()
            .api.v1.workspaces({ workspaceId })
            .members({ userId: member.user.id })
            .delete(),
        );
        putMembers((items) =>
          items.filter((item) => item.user.id !== member.user.id),
        );
        void queryClient.invalidateQueries({
          queryKey: [...workspaceKey(workspaceId), "dashboard"],
        });
        ToastQueue.neutral(
          t("settings:confirm.removed", { name: member.user.displayName }),
          { timeout: TOAST_MS },
        );
      },
      () => void remove(member),
    );
  const choose = (member: Member, role: Role) => {
    if (role === member.role) return;
    const isMe = member.user.id === me.id;
    if ((isMe && role !== "owner") || role === "viewer") {
      setQuestion({ kind: "role", member, role });
    } else {
      void changeRole(member, role);
    }
  };

  if (query.data === undefined) {
    if (query.isError) {
      return (
        <FailureState
          error={query.error}
          onRetry={() => void query.refetch()}
          dashboardHref={dashboardHref(me)}
          headingLevel={3}
          size="S"
        />
      );
    }
    if (isSlow) {
      return (
        <SlowLoadingState
          headingLevel={3}
          size="S"
          onRetry={() => void query.refetch()}
        />
      );
    }
    return (
      <Skeleton isLoading>
        <MembersSkeleton />
      </Skeleton>
    );
  }
  const members = query.data.items;
  const owners = members.filter((member) => member.role === "owner").length;
  return (
    <>
      <SettingsList aria-label={t("settings:workspace.members.list")}>
        {members.map((member) => {
          const isMe = member.user.id === me.id;
          const lock = lockOf(member, owners);
          const isSending = sending?.userId === member.user.id;
          const isDisabled = lock !== null || !isOnline || sending !== null;
          const name = member.user.displayName;
          return (
            <SettingsListItem
              key={member.user.id}
              avatar={
                <Avatar name={name} src={member.user.avatarUrl} size="M" />
              }
              title={name}
              titleNote={
                isMe
                  ? t("settings:workspace.members.you")
                  : member.user.badge === "suspended"
                    ? t("app:userBadge.suspended")
                    : undefined
              }
              description={member.email ?? undefined}
              note={
                lock === null
                  ? undefined
                  : t(`settings:workspace.members.${lock}`)
              }
              control={
                <Picker
                  aria-label={t("settings:workspace.members.role", { name })}
                  items={roles}
                  value={(isSending ? sending?.role : undefined) ?? member.role}
                  onChange={(value) => {
                    const parsed = roleSchema.safeParse(value);
                    if (parsed.success) choose(member, parsed.data);
                  }}
                  size="S"
                  isDisabled={isDisabled}
                />
              }
              actions={
                <ActionMenu
                  aria-label={t("settings:workspace.members.actions", { name })}
                  isDisabled={isDisabled}
                  onAction={() =>
                    setQuestion(
                      isMe ? { kind: "leave" } : { kind: "remove", member },
                    )
                  }
                >
                  <MenuItem id={isMe ? "leave" : "remove"}>
                    {isMe
                      ? t("settings:workspace.members.leave")
                      : t("settings:workspace.members.remove")}
                  </MenuItem>
                </ActionMenu>
              }
            />
          );
        })}
      </SettingsList>
      {failure !== null && (
        <SendFailure
          error={failure.error}
          messages={{
            LAST_OWNER: t("settings:workspace.members.lastOwner"),
            PERSONAL_OWNER: t("settings:workspace.members.personalOwner"),
          }}
          transient="couldNotSave"
          withSaveReasons
          onRetry={failure.retry}
          isRetryDisabled={!isOnline || sending !== null}
        />
      )}
      {question !== null && (
        <MemberQuestionDialog
          question={question}
          onAnswer={() => {
            setQuestion(null);
            if (question.kind === "role") {
              void changeRole(question.member, question.role);
            } else if (question.kind === "remove") {
              void remove(question.member);
            }
          }}
          onClose={() => setQuestion(null)}
        />
      )}
    </>
  );
}

/** The question before a change that undoes something (design-spec 6.16's table). */
function MemberQuestionDialog({
  question,
  onAnswer,
  onClose,
}: {
  question: MemberQuestion;
  onAnswer: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const { me, workspace } = useWorkspace();
  if (question.kind === "leave") {
    return (
      <LeaveWorkspaceDialog
        workspace={workspace}
        isOpenNow
        personalId={ownPersonalId(me)}
        onClose={onClose}
      />
    );
  }
  const name = question.member.user.displayName;
  const words =
    question.kind === "remove"
      ? {
          title: t("settings:confirm.removeTitle", { name }),
          body: t("settings:confirm.removeBody"),
          action: t("settings:confirm.remove"),
        }
      : question.member.user.id === me.id
        ? {
            title: t("settings:confirm.demoteSelfTitle", {
              role: t(`common:role.${question.role}`),
            }),
            body: t("settings:confirm.demoteSelfBody"),
            action: t("settings:confirm.demoteSelf"),
          }
        : {
            title: t("settings:confirm.viewerTitle", { name }),
            body: t("settings:confirm.viewerBody", { name }),
            action: t("settings:confirm.viewer"),
          };
  return (
    <AlertDialog
      isOpen
      variant={question.kind === "remove" ? "destructive" : "confirmation"}
      size="S"
      title={words.title}
      primaryActionLabel={words.action}
      cancelLabel={t("settings:confirm.cancel")}
      onPrimaryAction={onAnswer}
      onCancel={onClose}
    >
      {words.body}
    </AlertDialog>
  );
}

/** What an invitation's line under its email says: its role, and when it was sent and ends. */
function invitationLine(
  invitation: Invitation,
  timeZone: string,
  t: TFunction<["settings", "common"]>,
): string {
  const date = (value: string) => formatDate(value, { timeZone });
  // W4 lists the invitations to this workspace, which always name a role (only 28's
  // invitations without a workspace have none), and an accepted one its `acceptedAt`.
  return t(`settings:workspace.invitations.status.${invitation.status}`, {
    role: invitation.role === null ? "" : t(`common:role.${invitation.role}`),
    sent: date(invitation.createdAt),
    expires: date(invitation.expiresAt),
    accepted: date(invitation.acceptedAt ?? invitation.createdAt),
  });
}

/** A failed send of the invitations, the address it was for, and how to send it again. */
interface InvitationFailure {
  error: unknown;
  email: string;
  retry: () => void;
}

/**
 * The invitations (design-spec 6.16 9): an email and a role to send to, then the list,
 * the pending ones by default and every one with All, each pending or expired one with
 * Resend (a new link; the old one stops working) and the pending ones with Cancel. The
 * link goes only to the invited email: the screen never shows it.
 */
function Invitations() {
  const { t } = useTranslation(["settings", "common", "errors"]);
  const { me, workspace } = useWorkspace();
  const workspaceId = workspace.id;
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const [show, setShow] = useState<"pending" | "all">("pending");
  const query = useQuery(invitationsQuery(workspaceId, show));
  const isSlow = useIsSlow(query.isPending);
  const [sending, setSending] = useState<string | null>(null);
  const busy = useRef(false);
  const [failure, setFailure] = useState<InvitationFailure | null>(null);
  const sendThrough = useSendThrough();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: [...workspaceKey(workspaceId), "invitations"],
    });
  /**
   * Takes a failed send of the form or the list: what is out of date is read again (the
   * invitation accepted, cancelled or gone, the user no longer an Owner), and the failure
   * stays under the form. A lost session shows nothing: the app is leaving for M9 or 2.
   */
  const fail = (next: InvitationFailure | null) => {
    if (next === null || isSessionLost(next.error)) {
      setFailure(null);
      return;
    }
    const { error } = next;
    const code = failureCode(error);
    if (
      code === "INVITATION_ALREADY_ACCEPTED" ||
      code === "INVITATION_INVALID" ||
      (error instanceof ApiError && error.status === 404)
    ) {
      void refresh();
    }
    if (error instanceof ApiError && error.status === 403) {
      void queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
    }
    setFailure(next);
  };
  /** One action at a time on the list. */
  const act = async (
    key: string,
    email: string,
    request: () => Promise<void>,
    retry: () => void,
  ) => {
    if (busy.current) return;
    busy.current = true;
    setSending(key);
    setFailure(null);
    try {
      await sendThrough(request);
    } catch (error) {
      // Cancelling one cancelled already: done, as the list read again shows.
      if (
        key.startsWith("cancel:") &&
        failureCode(error) === "INVITATION_INVALID"
      ) {
        void refresh();
      } else {
        fail({ error, email, retry });
      }
    } finally {
      busy.current = false;
      setSending(null);
    }
  };
  const resend = (invitationId: string, email: string): Promise<void> =>
    act(
      `resend:${invitationId}`,
      email,
      async () => {
        await unwrap(
          api()
            .api.v1.invitations({ invitationId: inPath(invitationId) })
            .resend.post(),
        );
        await refresh();
        ToastQueue.neutral(
          t("settings:workspace.invitations.resent", { email }),
          { timeout: TOAST_MS },
        );
      },
      () => void resend(invitationId, email),
    );
  const cancel = (invitationId: string, email: string): Promise<void> =>
    act(
      `cancel:${invitationId}`,
      email,
      async () => {
        await unwrap(
          api()
            .api.v1.invitations({ invitationId: inPath(invitationId) })
            .delete(),
        );
        await refresh();
        ToastQueue.neutral(
          t("settings:workspace.invitations.cancelled", { email }),
          { timeout: TOAST_MS },
        );
      },
      () => void cancel(invitationId, email),
    );

  let list: ReactNode;
  if (query.data !== undefined) {
    list =
      query.data.items.length === 0 ? (
        <Text tone="secondary">
          {show === "pending"
            ? t("settings:workspace.invitations.none")
            : t("settings:workspace.invitations.noneAll")}
        </Text>
      ) : (
        <SettingsList aria-label={t("settings:workspace.invitations.list")}>
          {query.data.items.map((invitation) => {
            const { id, email, status } = invitation;
            const canResend = status === "pending" || status === "expired";
            return (
              <SettingsListItem
                key={id}
                title={email}
                description={invitationLine(invitation, me.timezone, t)}
                actions={
                  canResend ? (
                    <>
                      <Button
                        variant="secondary"
                        isQuiet
                        aria-label={t(
                          "settings:workspace.invitations.resendTo",
                          {
                            email,
                          },
                        )}
                        onPress={() => void resend(id, email)}
                        isPending={sending === `resend:${id}`}
                        isDisabled={!isOnline || sending !== null}
                      >
                        {t("settings:workspace.invitations.resend")}
                      </Button>
                      {status === "pending" && (
                        <Button
                          variant="secondary"
                          isQuiet
                          aria-label={t(
                            "settings:workspace.invitations.cancelTo",
                            { email },
                          )}
                          onPress={() => void cancel(id, email)}
                          isPending={sending === `cancel:${id}`}
                          isDisabled={!isOnline || sending !== null}
                        >
                          {t("settings:workspace.invitations.cancel")}
                        </Button>
                      )}
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </SettingsList>
      );
  } else if (query.isError) {
    list = (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
        headingLevel={3}
        size="S"
      />
    );
  } else if (isSlow) {
    list = (
      <SlowLoadingState
        headingLevel={3}
        size="S"
        onRetry={() => void query.refetch()}
      />
    );
  } else {
    list = (
      <Skeleton isLoading>
        <Text>{t("settings:workspace.invitations.none")}</Text>
      </Skeleton>
    );
  }
  return (
    <>
      <InviteForm
        onSent={refresh}
        onFailure={fail}
        onResend={(invitationId, email) => void resend(invitationId, email)}
        failure={failure}
        isBusy={sending !== null}
      />
      <Flex>
        <SegmentedControl
          aria-label={t("settings:workspace.invitations.show")}
          selectedKey={show}
          onSelectionChange={(key) =>
            setShow(key === "all" ? "all" : "pending")
          }
        >
          <SegmentedControlItem id="pending">
            {t("settings:workspace.invitations.pending")}
          </SegmentedControlItem>
          <SegmentedControlItem id="all">
            {t("settings:workspace.invitations.all")}
          </SegmentedControlItem>
        </SegmentedControl>
      </Flex>
      {list}
    </>
  );
}

/**
 * Send invitation (W4 POST): an email (6.0.8) and a role, Member at first. Its failures
 * and those of the list's Resend and Cancel show under it: the address a member or a
 * pending invitation already has (that one with its Resend), the rate limit, and Retry
 * for the rest (6.16「招待の送信の失敗は再試行」).
 */
function InviteForm({
  onSent,
  onFailure,
  onResend,
  failure,
  isBusy,
}: {
  onSent: () => Promise<unknown>;
  onFailure: (failure: InvitationFailure | null) => void;
  onResend: (invitationId: string, email: string) => void;
  failure: InvitationFailure | null;
  isBusy: boolean;
}) {
  const { t } = useTranslation(["settings", "common", "errors"]);
  const { workspace } = useWorkspace();
  const isOnline = useIsOnline();
  const roles = useRoleItems();
  const rejections = useRejectedFields(["email"] as const);
  const oneAtATime = useOneAtATime();
  const sendThrough = useSendThrough();
  const form = useAppForm({
    defaultValues: { email: "", role: "member" },
    listeners: {
      onChange: ({ fieldApi }) => rejections.clear(fieldApi.name),
    },
    onSubmit: ({ value, formApi }) =>
      oneAtATime(async () => {
        onFailure(null);
        rejections.clear();
        const email = value.email.trim();
        const role = roleSchema.catch("member").parse(value.role);
        try {
          await sendThrough(() =>
            unwrap(
              api()
                .api.v1.workspaces({ workspaceId: workspace.id })
                .invitations.post({ email, role }),
            ),
          );
        } catch (error) {
          if (!rejections.reject(error)) {
            onFailure({ error, email, retry: () => void form.handleSubmit() });
          }
          return;
        }
        formApi.reset();
        await onSent();
        ToastQueue.neutral(
          t("settings:workspace.invitations.sent", { email }),
          {
            timeout: TOAST_MS,
          },
        );
      }),
  });
  const pendingId =
    failure !== null &&
    failureCode(failure.error) === "INVITATION_PENDING" &&
    failure.error instanceof ApiError &&
    typeof failure.error.detail.invitationId === "string"
      ? failure.error.detail.invitationId
      : null;
  return (
    <Stack gap="space-200">
      <form.AppForm>
        <Form
          aria-label={t("settings:workspace.invitations.title")}
          onSubmit={() => void form.handleSubmit()}
        >
          <SettingsFieldRow>
            <form.AppField
              name="email"
              validators={{ onMount: emailSchema, onChange: emailSchema }}
            >
              {(field) => (
                <field.TextField
                  rejection={rejections.rejectionOf("email")}
                  aria-label={t("settings:workspace.invitations.email")}
                  placeholder={t(
                    "settings:workspace.invitations.emailPlaceholder",
                  )}
                  type="email"
                  autoComplete="off"
                  isRequired
                  isReadOnly={!isOnline}
                />
              )}
            </form.AppField>
            <form.AppField name="role">
              {(field) => (
                <field.Picker
                  aria-label={t("settings:workspace.invitations.role")}
                  items={roles}
                  isDisabled={!isOnline}
                />
              )}
            </form.AppField>
            <form.SubmitButton isDisabled={!isOnline || isBusy}>
              {t("settings:workspace.invitations.send")}
            </form.SubmitButton>
          </SettingsFieldRow>
        </Form>
      </form.AppForm>
      {failure !== null &&
        (pendingId !== null ? (
          <InlineAlert variant="negative">
            <Flex gap="space-200" wrap alignItems="center">
              <Text>
                {t("settings:workspace.invitations.alreadyPending", {
                  email: failure.email,
                })}
              </Text>
              <Button
                variant="secondary"
                size="S"
                onPress={() => onResend(pendingId, failure.email)}
                isDisabled={!isOnline || isBusy}
              >
                {t("settings:workspace.invitations.resend")}
              </Button>
            </Flex>
          </InlineAlert>
        ) : (
          <SendFailure
            error={failure.error}
            messages={{
              ALREADY_MEMBER: t(
                "settings:workspace.invitations.alreadyMember",
                {
                  email: failure.email,
                },
              ),
              INVITATION_ALREADY_ACCEPTED: t(
                "errors:INVITATION_ALREADY_ACCEPTED",
              ),
              INVITATION_INVALID: t(
                "settings:workspace.invitations.wasCancelled",
                { email: failure.email },
              ),
            }}
            transient="couldNotSave"
            withSaveReasons
            onRetry={failure.retry}
            isRetryDisabled={!isOnline || isBusy}
          />
        ))}
    </Stack>
  );
}
