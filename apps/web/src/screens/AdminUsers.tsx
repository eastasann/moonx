import { formatDate, formatList, formatRelativeTime } from "@moonx/i18n";
import {
  type AdminUser,
  type AdminWorkspace,
  adminUserStatusSchema,
  emailSchema,
  type Invitation,
  plainText,
  type Role,
  roleSchema,
  TEXT_LIMITS,
  type UserRef,
} from "@moonx/schemas";
import {
  AlertDialog,
  Badge,
  Button,
  ButtonGroup,
  ComboBox,
  DescriptionList,
  DescriptionListItem,
  Dialog,
  Flex,
  Form,
  Heading,
  IllustratedMessage,
  InlineAlert,
  ListDetailPattern,
  Picker,
  SearchField,
  Skeleton,
  Stack,
  type TableColumn,
  TableView,
  Text,
  TextField,
  useTwoColumns,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { SearchX, Users } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  adminToast,
  useAdminTabs,
  useDetailHistory,
} from "../components/admin";
import { failureCode, SendFailure } from "../components/SendFailure";
import {
  FailureState,
  NoAccessState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useWorkspace } from "../components/workspace";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import { copyText } from "../lib/files";
import { useAppForm, useOneAtATime, useRejectedFields } from "../lib/form";
import { inputIssueMessage } from "../lib/input-issues";
import type { AdminUsersTab } from "../lib/links";
import { useIsOnline } from "../lib/online";
import {
  type AdminUserFilters,
  adminInvitationsQuery,
  adminKey,
  adminUsersQuery,
  adminWorkspacesQuery,
} from "../lib/queries";
import { isSessionLost, useSendThrough } from "../lib/send";
import { useDocumentTitle } from "../lib/title";
import { AdminBreadcrumbs, AdminHeading } from "./AdminTemplates";

/** `/admin/users`'s search parameters (SDD 4章). */
export interface AdminUsersSearch {
  tab?: AdminUsersTab;
}

/** The searches of 28: what AD7 looks for in names and addresses (6.0.8 短文). */
const searchSchema = plainText(TEXT_LIMITS.short);

/** How long typing in a search pauses before the list asks again. */
const SEARCH_PAUSE_MS = 300;

/** The Picker value of "no filter". */
const ALL = "all";

/** An item of 28's lists, each its own row of a TableView. */
type Row<T> = T & { id: string };

/**
 * A search field whose text goes to `onSearch` once typing pauses, and only while it
 * keeps its rule (6.0.8): text that breaks it says why, unsent.
 */
function SearchBox({
  label,
  value,
  onSearch,
}: {
  label: string;
  value: string;
  onSearch: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  // The value set elsewhere (Clear filters) shows in the field, and is not sent again.
  useEffect(() => setText(value), [value]);
  const [issue] = searchSchema.safeParse(text).error?.issues ?? [];
  const error = issue === undefined ? undefined : inputIssueMessage(issue);
  useEffect(() => {
    if (text === value || error !== undefined) return;
    const timer = setTimeout(() => onSearch(text), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, value, error, onSearch]);
  return (
    <SearchField
      aria-label={label}
      placeholder={label}
      size="S"
      width="fill"
      value={text}
      onChange={setText}
      errorMessage={error}
    />
  );
}

/** A user's name with what 28 adds to it: "(suspended)", "(you)". */
function nameOf(user: AdminUser, myId: string, t: TFunction<["admin"]>) {
  if (user.id === myId) return t("admin:users.you", { name: user.displayName });
  if (user.status === "suspended") {
    return t("admin:users.suspendedName", { name: user.displayName });
  }
  return user.displayName;
}

/** An owner's name with the badge SDD 5.2 UserRef gives it. */
const refName = (ref: UserRef, t: TFunction<["admin"]>) =>
  ref.badge === "suspended"
    ? t("admin:users.suspendedName", { name: ref.displayName })
    : ref.displayName;

/** A workspace's Owners by name, or that it has none (SDD 5.13 AdminWorkspace). */
const ownersOf = (workspace: AdminWorkspace, t: TFunction<["admin"]>) =>
  workspace.owners.length === 0
    ? t("admin:workspaces.noOwner")
    : formatList(workspace.owners.map((owner) => refName(owner, t)));

/** When someone was last active: relative while recent, "Never" before the first time. */
function lastActive(
  at: string | null,
  timeZone: string,
  t: TFunction<["admin"]>,
) {
  return at === null
    ? t("admin:users.never")
    : formatRelativeTime(at, { timeZone });
}

/** The state of 6.0.6 a list shows in its place while it is not read. */
function ListState({
  query,
}: {
  query: {
    isError: boolean;
    error: unknown;
    isPending: boolean;
    refetch: () => unknown;
  };
}) {
  const { me } = useWorkspace();
  const isSlow = useIsSlow(query.isPending);
  if (query.isError) {
    return (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
        headingLevel={2}
        size="S"
      />
    );
  }
  if (isSlow) {
    return (
      <SlowLoadingState
        headingLevel={2}
        size="S"
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <ListSkeleton />;
}

/** Rows of placeholder words in the shape of a list (design-spec 6.0.6). */
function ListSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2, 3].map((row) => (
          <Stack key={row} gap="space-50">
            <Text variant="label">{t("admin:users.title")}</Text>
            <Text variant="caption">{t("admin:users.never")}</Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** "Nothing matches" a search or filter, with the way back to the whole list. */
function NoMatch({ onClear }: { onClear: () => void }) {
  const { t } = useTranslation(["admin"]);
  return (
    <IllustratedMessage
      headingLevel={2}
      size="S"
      icon={<SearchX />}
      heading={t("admin:users.noMatch")}
      actions={
        <Button variant="secondary" onPress={onClear}>
          {t("admin:users.clear")}
        </Button>
      }
    />
  );
}

interface ActionFailure {
  error: unknown;
  retry: () => void;
}

/**
 * Sends one action of a detail at a time; a failure stays near its button (design-spec
 * 6.16 9's rule for the actions that are not autosaves, which 28 shares).
 */
function useOneAction() {
  const sendThrough = useSendThrough();
  const busy = useRef(false);
  const [sending, setSending] = useState<string | null>(null);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const run = async (
    key: string,
    request: () => Promise<void>,
    retry: () => void,
    onError?: (error: unknown) => boolean,
  ) => {
    if (busy.current) return;
    busy.current = true;
    setSending(key);
    setFailure(null);
    try {
      await sendThrough(request);
    } catch (error) {
      if (!isSessionLost(error) && onError?.(error) !== true) {
        setFailure({ error, retry });
      }
    } finally {
      busy.current = false;
      setSending(null);
    }
  };
  return { run, sending, failure, clearFailure: () => setFailure(null) };
}

/**
 * The selected user (design-spec 6.17 Users): what 28 knows of them, never what they
 * wrote, and Suspend or Resume. Suspending ends their sessions and stops their sign-in;
 * what they belong to stays. A deleted account only shows; the operator is never
 * suspended by themselves.
 */
function UserDetail({ user }: { user: AdminUser }) {
  const { t } = useTranslation(["admin"]);
  const { me } = useWorkspace();
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const action = useOneAction();
  const [isAsking, setAsking] = useState(false);
  const isMe = user.id === me.id;
  const name = user.displayName;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: [...adminKey, "users"] });
  const change = (to: "suspend" | "reactivate"): Promise<void> =>
    action.run(
      to,
      async () => {
        const users = api().api.v1.admin.users({ userId: inPath(user.id) });
        await unwrap(
          to === "suspend" ? users.suspend.post() : users.reactivate.post(),
        );
        await refresh();
        adminToast(
          to === "suspend"
            ? t("admin:users.suspended", { name })
            : t("admin:users.reactivated", { name }),
        );
      },
      () => void change(to),
      (error) => {
        // Deleted meanwhile: the list read again shows it so.
        if (error instanceof ApiError && error.status === 404) void refresh();
        return false;
      },
    );
  const timeZone = me.timezone;
  return (
    <Stack gap="space-300">
      <Stack gap="space-100">
        <Flex gap="space-200" alignItems="center" wrap>
          <Heading level={2}>{nameOf(user, me.id, t)}</Heading>
          {user.isAdmin && <Badge>{t("admin:users.operator")}</Badge>}
        </Flex>
        {user.status !== "deleted" && (
          <Text tone="secondary">{user.email}</Text>
        )}
      </Stack>
      <DescriptionList>
        <DescriptionListItem label={t("admin:users.status")}>
          <Text variant="body-compact">
            {t(`admin:userStatus.${user.status}`)}
          </Text>
        </DescriptionListItem>
        <DescriptionListItem label={t("admin:users.joined")}>
          <Text variant="body-compact">
            {formatRelativeTime(user.createdAt, { timeZone })}
          </Text>
        </DescriptionListItem>
        <DescriptionListItem label={t("admin:users.lastActive")}>
          <Text variant="body-compact">
            {lastActive(user.lastActiveAt, timeZone, t)}
          </Text>
        </DescriptionListItem>
        <DescriptionListItem label={t("admin:users.workspaces")}>
          <Text variant="number-sm">{String(user.workspaceCount)}</Text>
        </DescriptionListItem>
      </DescriptionList>
      {user.status === "deleted" ? (
        <Text tone="secondary">{t("admin:users.deletedNote")}</Text>
      ) : (
        <Stack gap="space-200">
          <Text variant="body-sm" tone="secondary">
            {user.status === "suspended"
              ? t("admin:users.suspendedNote")
              : t("admin:users.suspendNote")}
          </Text>
          <Flex gap="space-200" alignItems="center" wrap>
            {user.status === "suspended" ? (
              <Button
                variant="secondary"
                onPress={() => void change("reactivate")}
                isPending={action.sending === "reactivate"}
                isDisabled={!isOnline || action.sending !== null}
              >
                {t("admin:users.reactivate")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                onPress={() => setAsking(true)}
                isPending={action.sending === "suspend"}
                isDisabled={!isOnline || isMe || action.sending !== null}
              >
                {t("admin:users.suspend")}
              </Button>
            )}
            {isMe && (
              <Text variant="caption" tone="secondary">
                {t("admin:users.notSelf")}
              </Text>
            )}
          </Flex>
          {action.failure !== null && (
            <SendFailure
              error={action.failure.error}
              messages={{
                CANNOT_SUSPEND_SELF: t("admin:users.notSelf"),
                NOT_FOUND: t("admin:users.gone"),
              }}
              transient="couldNotSave"
              withSaveReasons
              onRetry={action.failure.retry}
              isRetryDisabled={!isOnline || action.sending !== null}
            />
          )}
        </Stack>
      )}
      {isAsking && (
        <AlertDialog
          isOpen
          variant="destructive"
          size="S"
          title={t("admin:users.suspendTitle", { name })}
          primaryActionLabel={t("admin:users.suspend")}
          cancelLabel={t("admin:users.cancel")}
          onPrimaryAction={() => {
            setAsking(false);
            void change("suspend");
          }}
          onCancel={() => setAsking(false)}
        >
          {t("admin:users.suspendBody")}
        </AlertDialog>
      )}
    </Stack>
  );
}

/** Users: the search and state filter, the table, and the selected user beside it. */
function useUsersTab(
  isShown: boolean,
  selected: string | undefined,
  onSelect: (id: string) => void,
): TabParts {
  const { t } = useTranslation(["admin"]);
  const { me } = useWorkspace();
  const isTwoColumns = useTwoColumns();
  const [filters, setFilters] = useState<AdminUserFilters>({});
  const query = useQuery({
    ...adminUsersQuery(filters),
    placeholderData: (previous) => previous,
    enabled: isShown,
  });
  const items: Row<AdminUser>[] = query.data ?? [];
  const chosen =
    items.find(({ id }) => id === selected) ??
    (isTwoColumns ? items[0] : undefined);
  const isFiltered = (filters.q ?? "") !== "" || filters.status !== undefined;
  const columns: TableColumn[] = [
    { id: "name", name: t("admin:users.name"), isRowHeader: true },
    { id: "lastActive", name: t("admin:users.lastActive"), width: "24%" },
    {
      id: "workspaces",
      name: t("admin:users.workspaces"),
      numeric: true,
      width: "22%",
    },
    { id: "status", name: t("admin:users.status"), width: "20%" },
  ];
  const filtersNode = (
    <>
      <Picker
        label={t("admin:users.status")}
        labelPosition="inside"
        size="S"
        items={[
          { id: ALL, label: t("admin:users.all") },
          ...adminUserStatusSchema.options.map((id) => ({
            id,
            label: t(`admin:userStatus.${id}`),
          })),
        ]}
        value={filters.status ?? ALL}
        onChange={(value) =>
          setFilters({
            ...filters,
            status: adminUserStatusSchema.safeParse(value).data,
          })
        }
      />
      <SearchBox
        label={t("admin:users.search")}
        value={filters.q ?? ""}
        onSearch={(q) =>
          setFilters({ ...filters, q: q === "" ? undefined : q })
        }
      />
    </>
  );
  let list: ReactNode;
  if (query.data === undefined) {
    list = <ListState query={query} />;
  } else if (items.length === 0 && isFiltered) {
    list = <NoMatch onClear={() => setFilters({})} />;
  } else {
    list = (
      <TableView
        aria-label={t("admin:tabs.users")}
        columns={columns}
        items={items}
        selectionMode="single"
        selectedKeys={chosen === undefined ? [] : [chosen.id]}
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          if (key !== undefined) onSelect(String(key));
        }}
        textValue={(user) => user.displayName}
        renderCell={(user, column) => {
          if (column === "name") {
            return (
              <Stack gap="space-25">
                <Text variant="label">{nameOf(user, me.id, t)}</Text>
                {user.status !== "deleted" && (
                  <Text variant="caption" tone="secondary">
                    {user.email}
                  </Text>
                )}
              </Stack>
            );
          }
          if (column === "lastActive") {
            return lastActive(user.lastActiveAt, me.timezone, t);
          }
          if (column === "workspaces") return String(user.workspaceCount);
          return t(`admin:userStatus.${user.status}`);
        }}
      />
    );
  }
  return {
    filters: filtersNode,
    list,
    detail:
      chosen === undefined ? null : (
        <UserDetail key={chosen.id} user={chosen} />
      ),
  };
}

/** The selected workspace (design-spec 6.17 Workspaces): how much it is used, never what is in it. */
function WorkspaceDetail({ workspace }: { workspace: AdminWorkspace }) {
  const { t } = useTranslation(["admin"]);
  const { me } = useWorkspace();
  return (
    <Stack gap="space-300">
      <Stack gap="space-100">
        <Heading level={2}>{workspace.name}</Heading>
        <Text tone="secondary">
          {workspace.isPersonal
            ? t("admin:workspaces.personal")
            : t("admin:workspaces.team")}
        </Text>
      </Stack>
      <DescriptionList>
        <DescriptionListItem label={t("admin:workspaces.owners")}>
          <Text variant="body-compact">{ownersOf(workspace, t)}</Text>
        </DescriptionListItem>
        <DescriptionListItem label={t("admin:workspaces.members")}>
          <Text variant="number-sm">{String(workspace.memberCount)}</Text>
        </DescriptionListItem>
        <DescriptionListItem label={t("admin:workspaces.ideas")}>
          <Text variant="number-sm">{String(workspace.ideaCount)}</Text>
        </DescriptionListItem>
        <DescriptionListItem label={t("admin:workspaces.lastActive")}>
          <Text variant="body-compact">
            {lastActive(workspace.lastActiveAt, me.timezone, t)}
          </Text>
        </DescriptionListItem>
      </DescriptionList>
    </Stack>
  );
}

/** Workspaces: the search, the table, and the selected workspace beside it. */
function useWorkspacesTab(
  isShown: boolean,
  selected: string | undefined,
  onSelect: (id: string) => void,
): TabParts {
  const { t } = useTranslation(["admin", "app"]);
  const isTwoColumns = useTwoColumns();
  const [q, setQ] = useState("");
  const query = useQuery({
    ...adminWorkspacesQuery(q === "" ? undefined : q),
    placeholderData: (previous) => previous,
    enabled: isShown,
  });
  const items: Row<AdminWorkspace>[] = query.data ?? [];
  const chosen =
    items.find(({ id }) => id === selected) ??
    (isTwoColumns ? items[0] : undefined);
  const columns: TableColumn[] = [
    { id: "name", name: t("admin:workspaces.name"), isRowHeader: true },
    {
      id: "members",
      name: t("admin:workspaces.members"),
      numeric: true,
      width: "22%",
    },
    {
      id: "ideas",
      name: t("admin:workspaces.ideas"),
      numeric: true,
      width: "18%",
    },
  ];
  let list: ReactNode;
  if (query.data === undefined) {
    list = <ListState query={query} />;
  } else if (items.length === 0 && q !== "") {
    list = <NoMatch onClear={() => setQ("")} />;
  } else {
    list = (
      <TableView
        aria-label={t("admin:tabs.workspaces")}
        columns={columns}
        items={items}
        selectionMode="single"
        selectedKeys={chosen === undefined ? [] : [chosen.id]}
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          if (key !== undefined) onSelect(String(key));
        }}
        textValue={(workspace) => workspace.name}
        renderCell={(workspace, column) => {
          if (column === "name") {
            return (
              <Stack gap="space-25">
                <Text variant="label">{workspace.name}</Text>
                <Text variant="caption" tone="secondary">
                  {[
                    ...(workspace.isPersonal
                      ? [t("admin:workspaces.personal")]
                      : []),
                    ownersOf(workspace, t),
                  ].join(t("app:separator"))}
                </Text>
              </Stack>
            );
          }
          if (column === "members") return String(workspace.memberCount);
          return String(workspace.ideaCount);
        }}
      />
    );
  }
  return {
    filters: (
      <SearchBox
        label={t("admin:workspaces.search")}
        value={q}
        onSearch={setQ}
      />
    ),
    list,
    detail:
      chosen === undefined ? null : <WorkspaceDetail workspace={chosen} />,
  };
}

/** What an invitation's line says: its role, and when it was sent, ends or was accepted (6.16 9). */
function invitationLine(
  invitation: Invitation,
  timeZone: string,
  t: TFunction<["admin", "common"]>,
): string {
  const date = (value: string) => formatDate(value, { timeZone });
  // Only an invitation to no workspace has no role (SDD 5.13 AD9).
  const role =
    invitation.role === null
      ? t("admin:invitations.noWorkspace")
      : t(`common:role.${invitation.role}`);
  return t(`admin:invitations.line.${invitation.status}`, {
    role,
    sent: date(invitation.createdAt),
    expires: date(invitation.expiresAt),
    // An accepted invitation always has its `acceptedAt` (SDD 5.5); the line of any other
    // state does not use it.
    accepted: date(invitation.acceptedAt ?? invitation.createdAt),
  });
}

/** The words 28 and 9 share for an invitation the API refuses (design-spec 6.16 9). */
function invitationMessages(
  email: string,
  t: TFunction<["admin", "errors"]>,
): Partial<Record<string, string>> {
  return {
    ALREADY_MEMBER: t("admin:invitations.alreadyMember", { email }),
    INVITATION_ALREADY_ACCEPTED: t("errors:INVITATION_ALREADY_ACCEPTED"),
    INVITATION_INVALID: t("admin:invitations.wasCancelled", { email }),
    NOT_FOUND: t("admin:invitations.workspaceGone"),
  };
}

/** The id of the pending invitation a 409 INVITATION_PENDING points to (SDD 5.5). */
const pendingIdOf = (error: unknown) =>
  failureCode(error) === "INVITATION_PENDING" &&
  error instanceof ApiError &&
  typeof error.detail.invitationId === "string"
    ? error.detail.invitationId
    : null;

/**
 * "An invitation to {email} is already pending" with its Resend, or the failure of the
 * send in words (design-spec 6.16 9, which 28's invitations follow).
 */
function InvitationFailureNote({
  failure,
  email,
  onResend,
  isBusy,
}: {
  failure: ActionFailure;
  email: string;
  onResend: (invitationId: string) => void;
  isBusy: boolean;
}) {
  const { t } = useTranslation(["admin", "errors"]);
  const isOnline = useIsOnline();
  const pendingId = pendingIdOf(failure.error);
  if (pendingId !== null) {
    return (
      <InlineAlert variant="negative">
        <Flex gap="space-200" wrap alignItems="center">
          <Text>{t("admin:invitations.alreadyPending", { email })}</Text>
          <Button
            variant="secondary"
            size="S"
            onPress={() => onResend(pendingId)}
            isDisabled={!isOnline || isBusy}
          >
            {t("admin:invitations.resend")}
          </Button>
        </Flex>
      </InlineAlert>
    );
  }
  return (
    <SendFailure
      error={failure.error}
      messages={invitationMessages(email, t)}
      transient="couldNotSave"
      withSaveReasons
      onRetry={failure.retry}
      isRetryDisabled={!isOnline || isBusy}
    />
  );
}

/** W5 for an invitation of 28: a new link by mail, the old one stopping (design-spec 6.16). */
function useResend() {
  const { t } = useTranslation(["admin"]);
  const queryClient = useQueryClient();
  return async (invitationId: string, email: string) => {
    await unwrap(
      api()
        .api.v1.invitations({ invitationId: inPath(invitationId) })
        .resend.post(),
    );
    await queryClient.invalidateQueries({
      queryKey: [...adminKey, "invitations"],
    });
    adminToast(t("admin:invitations.resent", { email }));
  };
}

/**
 * The selected invitation (design-spec 6.17 Invitations): where it invites to and where
 * it stands, Resend for a pending or expired one (by mail only: the screen shows no
 * link) and Cancel for a pending one.
 */
function InvitationDetail({ invitation }: { invitation: Invitation }) {
  const { t } = useTranslation(["admin", "common", "errors"]);
  const { me } = useWorkspace();
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const action = useOneAction();
  const resendTo = useResend();
  const { id, email, status } = invitation;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: [...adminKey, "invitations"] });
  /** The invitation accepted, cancelled or gone meanwhile: the list is read again. */
  const onError = (error: unknown) => {
    const code = failureCode(error);
    if (
      code === "INVITATION_ALREADY_ACCEPTED" ||
      code === "INVITATION_INVALID" ||
      (error instanceof ApiError && error.status === 404)
    ) {
      void refresh();
    }
    return false;
  };
  const resend = (invitationId: string): Promise<void> =>
    action.run(
      `resend:${invitationId}`,
      () => resendTo(invitationId, email),
      () => void resend(invitationId),
      onError,
    );
  const cancel = (): Promise<void> =>
    action.run(
      "cancel",
      async () => {
        await unwrap(
          api()
            .api.v1.invitations({ invitationId: inPath(id) })
            .delete(),
        );
        await refresh();
        adminToast(t("admin:invitations.cancelled", { email }));
      },
      () => void cancel(),
      (error) => {
        // Cancelling one cancelled already: done, as the list read again shows.
        if (failureCode(error) === "INVITATION_INVALID") {
          void refresh();
          return true;
        }
        return onError(error);
      },
    );
  return (
    <Stack gap="space-300">
      <Stack gap="space-100">
        <Heading level={2}>{email}</Heading>
        <Text tone="secondary">
          {invitationLine(invitation, me.timezone, t)}
        </Text>
      </Stack>
      <DescriptionList>
        <DescriptionListItem label={t("admin:invitations.workspace")}>
          <Text variant="body-compact">
            {invitation.workspace?.name ?? t("admin:invitations.noWorkspace")}
          </Text>
        </DescriptionListItem>
        <DescriptionListItem label={t("admin:invitations.role")}>
          <Text variant="body-compact">
            {invitation.role === null
              ? t("admin:invitations.noRole")
              : t(`common:role.${invitation.role}`)}
          </Text>
        </DescriptionListItem>
        <DescriptionListItem label={t("admin:invitations.status")}>
          <Text variant="body-compact">
            {t(`admin:invitationStatus.${status}`)}
          </Text>
        </DescriptionListItem>
        <DescriptionListItem label={t("admin:invitations.invitedBy")}>
          <Text variant="body-compact">
            {invitation.invitedBy === null
              ? t("admin:invitations.nobody")
              : refName(invitation.invitedBy, t)}
          </Text>
        </DescriptionListItem>
      </DescriptionList>
      {(status === "pending" || status === "expired") && (
        <Stack gap="space-200">
          <Flex gap="space-200" wrap>
            <Button
              variant="secondary"
              onPress={() => void resend(id)}
              isPending={action.sending === `resend:${id}`}
              isDisabled={!isOnline || action.sending !== null}
            >
              {t("admin:invitations.resend")}
            </Button>
            {status === "pending" && (
              <Button
                variant="secondary"
                isQuiet
                onPress={() => void cancel()}
                isPending={action.sending === "cancel"}
                isDisabled={!isOnline || action.sending !== null}
              >
                {t("admin:invitations.cancel")}
              </Button>
            )}
          </Flex>
          {action.failure !== null && (
            <InvitationFailureNote
              failure={action.failure}
              email={email}
              onResend={(other) => void resend(other)}
              isBusy={action.sending !== null}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}

/** The ComboBox value of "no workspace". */
const NO_WORKSPACE = "none";

const ROLES = ["owner", "member", "viewer"] as const satisfies readonly Role[];

/**
 * Invite someone (design-spec 6.17 Invitations, SDD 5.13 AD9): an email, and if wanted a
 * workspace and a role in it. Sent, it shows the link the mail carries, for the operator
 * to hand over when the mail does not arrive (2026-10-03 user decision). Its failures are
 * 9's (6.16), kept with what was typed (6.0.6 モーダルの共通の決まり).
 */
function InviteDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["admin", "common", "errors"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const formId = useId();
  const sendThrough = useSendThrough();
  const resendTo = useResend();
  const oneAtATime = useOneAtATime();
  // The role goes with a workspace and only then, so only the email can be refused.
  const rejections = useRejectedFields(["email"] as const);
  const workspaces = useQuery(adminWorkspacesQuery());
  // With the address it was sent to: the field may have changed since.
  const [failure, setFailure] = useState<
    (ActionFailure & { email: string }) | null
  >(null);
  const [sentTo, setSentTo] = useState<{ email: string; link: string } | null>(
    null,
  );
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [isResending, setResending] = useState(false);
  const form = useAppForm({
    defaultValues: { email: "", workspaceId: NO_WORKSPACE, role: "member" },
    listeners: {
      onChange: ({ fieldApi }) => rejections.clear(fieldApi.name),
    },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        setFailure(null);
        rejections.clear();
        const email = value.email.trim();
        const workspaceId =
          value.workspaceId === NO_WORKSPACE ? undefined : value.workspaceId;
        const role = roleSchema.catch("member").parse(value.role);
        try {
          const sent = await sendThrough(() =>
            unwrap(
              api().api.v1.admin.invitations.post(
                workspaceId === undefined
                  ? { email }
                  : { email, workspaceId, role },
              ),
            ),
          );
          await queryClient.invalidateQueries({
            queryKey: [...adminKey, "invitations"],
          });
          setSentTo({ email, link: sent.link });
        } catch (error) {
          if (isSessionLost(error) || rejections.reject(error)) return;
          if (error instanceof ApiError && error.status === 404) {
            void workspaces.refetch();
          }
          setFailure({ error, email, retry: () => void form.handleSubmit() });
        }
      }),
  });
  const items = [
    { id: NO_WORKSPACE, label: t("admin:invitations.noWorkspace") },
    ...(workspaces.data ?? []).map((workspace) => ({
      id: workspace.id,
      label: workspace.name,
      description: workspace.isPersonal
        ? t("admin:workspaces.personal")
        : undefined,
    })),
  ];
  const roles = ROLES.map((role) => ({
    id: role,
    label: t(`common:role.${role}`),
  }));

  if (sentTo !== null) {
    return (
      <Dialog
        isOpen
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
        size="M"
        density="spacious"
        title={t("admin:invitations.sentTitle")}
        buttons={
          <ButtonGroup align="end">
            <Button variant="primary" onPress={onClose}>
              {t("admin:invitations.close")}
            </Button>
          </ButtonGroup>
        }
      >
        <Stack gap="space-300">
          <Text>{t("admin:invitations.sent", { email: sentTo.email })}</Text>
          <TextField
            label={t("admin:invitations.link")}
            value={sentTo.link}
            description={t("admin:invitations.linkNote")}
            width="full"
            isReadOnly
          />
          <Flex gap="space-200" alignItems="center" wrap>
            <Button
              variant="secondary"
              onPress={() =>
                void copyText(sentTo.link).then(
                  () => setCopy("copied"),
                  () => setCopy("failed"),
                )
              }
            >
              {t("admin:invitations.copy")}
            </Button>
            {copy !== "idle" && (
              <Text variant="caption" tone="secondary">
                {copy === "copied"
                  ? t("admin:invitations.copied")
                  : t("admin:invitations.copyFailed")}
              </Text>
            )}
          </Flex>
        </Stack>
      </Dialog>
    );
  }
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      size="M"
      density="spacious"
      title={t("admin:invitations.inviteTitle")}
      buttons={
        <form.AppForm>
          <ButtonGroup align="end">
            <Button variant="secondary" onPress={onClose}>
              {t("admin:invitations.cancelDialog")}
            </Button>
            <form.SubmitButton
              form={formId}
              isDisabled={!isOnline || isResending}
            >
              {t("admin:invitations.send")}
            </form.SubmitButton>
          </ButtonGroup>
        </form.AppForm>
      }
    >
      <form.AppForm>
        <Form id={formId} onSubmit={() => void form.handleSubmit()}>
          <form.AppField
            name="email"
            validators={{ onMount: emailSchema, onChange: emailSchema }}
          >
            {(field) => (
              <field.TextField
                rejection={rejections.rejectionOf("email")}
                label={t("admin:invitations.email")}
                type="email"
                autoComplete="off"
                width="full"
                isRequired
                isReadOnly={!isOnline}
                autoFocus
              />
            )}
          </form.AppField>
          <form.AppField name="workspaceId">
            {(field) => (
              <ComboBox
                label={t("admin:invitations.workspace")}
                description={t("admin:invitations.workspaceNote")}
                items={items}
                value={field.state.value}
                onChange={(value) => field.handleChange(value ?? NO_WORKSPACE)}
                width="full"
                isDisabled={!isOnline}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.workspaceId}>
            {(workspaceId) =>
              workspaceId !== NO_WORKSPACE && (
                <form.AppField name="role">
                  {(field) => (
                    <field.Picker
                      label={t("admin:invitations.role")}
                      items={roles}
                      isRequired
                      isDisabled={!isOnline}
                    />
                  )}
                </form.AppField>
              )
            }
          </form.Subscribe>
          {failure !== null && (
            <InvitationFailureNote
              failure={failure}
              email={failure.email}
              onResend={(invitationId) => {
                setResending(true);
                void sendThrough(() => resendTo(invitationId, failure.email))
                  .then(onClose, (error: unknown) => {
                    if (!isSessionLost(error)) {
                      setFailure({
                        error,
                        email: failure.email,
                        retry: () => void form.handleSubmit(),
                      });
                    }
                  })
                  .finally(() => setResending(false));
              }}
              isBusy={isResending}
            />
          )}
        </Form>
      </form.AppForm>
    </Dialog>
  );
}

/** Invitations: Pending / All, the table, the selected invitation beside it, and Invite. */
function useInvitationsTab(
  isShown: boolean,
  selected: string | undefined,
  onSelect: (id: string) => void,
): TabParts {
  const { t } = useTranslation(["admin", "common"]);
  const [isInviting, setInviting] = useState(false);
  const isTwoColumns = useTwoColumns();
  const [show, setShow] = useState<"pending" | "all">("pending");
  const query = useQuery({
    ...adminInvitationsQuery(show),
    placeholderData: (previous) => previous,
    enabled: isShown,
  });
  const items: Row<Invitation>[] = query.data ?? [];
  const chosen =
    items.find(({ id }) => id === selected) ??
    (isTwoColumns ? items[0] : undefined);
  const columns: TableColumn[] = [
    { id: "email", name: t("admin:invitations.email"), isRowHeader: true },
    { id: "status", name: t("admin:invitations.status"), width: "28%" },
  ];
  let list: ReactNode;
  if (query.data === undefined) {
    list = <ListState query={query} />;
  } else {
    list = (
      <TableView
        aria-label={t("admin:tabs.invitations")}
        columns={columns}
        items={items}
        selectionMode="single"
        selectedKeys={chosen === undefined ? [] : [chosen.id]}
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          if (key !== undefined) onSelect(String(key));
        }}
        textValue={(invitation) => invitation.email}
        renderEmptyState={() => (
          <IllustratedMessage
            headingLevel={2}
            size="S"
            icon={<Users />}
            heading={
              show === "pending"
                ? t("admin:invitations.none")
                : t("admin:invitations.noneAll")
            }
          />
        )}
        renderCell={(invitation, column) => {
          if (column === "email") {
            return (
              <Stack gap="space-25">
                <Text variant="label">{invitation.email}</Text>
                <Text variant="caption" tone="secondary">
                  {invitation.workspace === null || invitation.role === null
                    ? t("admin:invitations.noWorkspace")
                    : t("admin:invitations.where", {
                        workspace: invitation.workspace.name,
                        role: t(`common:role.${invitation.role}`),
                      })}
                </Text>
              </Stack>
            );
          }
          return t(`admin:invitationStatus.${invitation.status}`);
        }}
      />
    );
  }
  return {
    newItem: {
      label: t("admin:invitations.invite"),
      onPress: () => setInviting(true),
    },
    filters: (
      <Picker
        label={t("admin:invitations.show")}
        labelPosition="inside"
        size="S"
        items={[
          { id: "pending", label: t("admin:invitations.pending") },
          { id: "all", label: t("admin:invitations.all") },
        ]}
        value={show}
        onChange={(value) => setShow(value === "all" ? "all" : "pending")}
      />
    ),
    list,
    detail:
      chosen === undefined ? null : (
        <InvitationDetail key={chosen.id} invitation={chosen} />
      ),
    dialog: isInviting ? (
      <InviteDialog onClose={() => setInviting(false)} />
    ) : null,
  };
}

/** What a tab of 28 puts in its pattern D. */
interface TabParts {
  newItem?: { label: string; onPress: () => void };
  filters: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  dialog?: ReactNode;
}

/**
 * The tab's list and detail, inside the frame (design-spec 6.17). The pattern and its
 * tabs stay in place as the tab changes, so the keyboard stays on the tabs; only the
 * shown tab reads its list, and each keeps its filters. The row shown is the history
 * entry's (no URL holds it, SDD 4章): in one pane opening it adds an entry, and Back
 * returns to the list.
 */
function UsersBody({ tab }: { tab: AdminUsersTab }) {
  const { t } = useTranslation(["admin"]);
  const tabs = useAdminTabs(tab);
  const isTwoColumns = useTwoColumns();
  const detailHistory = useDetailHistory();
  const selected = useRouterState({
    select: (state) => state.location.state.adminRow,
  });
  const select = (id: string) => detailHistory.open({ row: id }, isTwoColumns);
  const users = useUsersTab(tab === "users", selected, select);
  const workspaces = useWorkspacesTab(tab === "workspaces", selected, select);
  const invitations = useInvitationsTab(
    tab === "invitations",
    selected,
    select,
  );
  const shown =
    tab === "users" ? users : tab === "workspaces" ? workspaces : invitations;
  return (
    <>
      <ListDetailPattern
        header={<AdminHeading />}
        tabs={tabs}
        newItem={shown.newItem}
        filters={shown.filters}
        list={shown.list}
        detail={shown.detail}
        listLabel={t(`admin:tabs.${tab}`)}
        onBack={() => detailHistory.close({})}
      />
      {invitations.dialog}
    </>
  );
}

/** 28's shape while its route loads (design-spec 6.0.6). */
export function AdminUsersSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <ListDetailPattern
      header={<AdminHeading />}
      list={<ListSkeleton />}
      detail={null}
      listLabel={t("admin:tabs.users")}
      onBack={() => {}}
    />
  );
}

/**
 * 28 Admin: Users & Workspaces (design-spec 6.17, pattern D): the users with Suspend and
 * Resume, the workspaces, and the invitations with Invite, each list with its selected
 * item beside it. Operators only: anyone else is told they have no access (6.0.6).
 */
export function AdminUsersScreen({ search }: { search: AdminUsersSearch }) {
  const { t } = useTranslation(["admin"]);
  const { me } = useWorkspace();
  useDocumentTitle(...(me.isAdmin ? [t("admin:users.title")] : []));
  return (
    <WorkspaceFrame
      current="admin"
      breadcrumbs={
        me.isAdmin ? (
          <AdminBreadcrumbs screen={t("admin:users.title")} />
        ) : undefined
      }
    >
      {me.isAdmin ? (
        <UsersBody tab={search.tab ?? "users"} />
      ) : (
        <NoAccessState dashboardHref={dashboardHref(me)} />
      )}
    </WorkspaceFrame>
  );
}
