import {
  displayNameSchema,
  EMAIL_MAX,
  type Me,
  type MeUpdate,
  passwordSchema,
  requiredText,
  sameEmail,
  type Theme,
  themeSchema,
  timeZoneSchema,
} from "@moonx/schemas";
import {
  Breadcrumb,
  Breadcrumbs,
  Button,
  ButtonGroup,
  ComboBox,
  DescriptionList,
  DescriptionListItem,
  Dialog,
  Flex,
  Form,
  Heading,
  InlineAlert,
  Link,
  Picker,
  SettingsList,
  SettingsListItem,
  SettingsPattern,
  Stack,
  Text,
  TextField,
  ToastQueue,
} from "@moonx/ui-web";
import {
  type QueryClient,
  useQueries,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LeaveWorkspaceDialog } from "../components/LeaveWorkspaceDialog";
import { useLogOutRequest } from "../components/LogOutRequest";
import { PhotoField } from "../components/PhotoField";
import { type RowFieldsSpec, useRowFields } from "../components/RowFields";
import { SaveFailureNote } from "../components/SaveFeedback";
import { failureCode, SendFailure } from "../components/SendFailure";
import { useGoogleStart } from "../components/useGoogleStart";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { ownPersonalId, useWorkspace } from "../components/workspace";
import { PREFERENCES_KEY, PROFILE_KEY } from "../lib/account";
import { ApiError, api, unwrap } from "../lib/api";
import { changePassword, continueWithGoogle } from "../lib/auth";
import type { SaveTarget } from "../lib/autosave";
import { useAutosave } from "../lib/autosave-react";
import { useAppForm, useOneAtATime } from "../lib/form";
import { ruleErrorOf } from "../lib/input-issues";
import { settingsHref } from "../lib/links";
import { useIsOnline } from "../lib/online";
import { membersQuery, meQuery } from "../lib/queries";
import { isSessionLost, useSendThrough } from "../lib/send";
import { useDocumentTitle } from "../lib/title";

/** How long the toasts of 4 stay (Spectrum's minimum). */
const TOAST_MS = 5000;

/**
 * A save item of the user's own fields (U2). Me carries no version (SDD 5.4), so every
 * send goes with 0 and leaves 0, and U2 never answers a conflict: `loadTheirs` only
 * reads the user again.
 */
function meTarget(
  queryClient: QueryClient,
  key: string,
  noun: string,
): SaveTarget {
  return {
    key,
    noun,
    send: async (fields) => {
      const updated = await unwrap(api().api.v1.me.patch(fields as MeUpdate));
      // Only what this save sent: the other item's save may answer after this one, from
      // before this one was made, and must not take its field back.
      const sent = Object.fromEntries(
        Object.keys(fields).map((field) => [
          field,
          updated[field as keyof MeUpdate],
        ]),
      );
      queryClient.setQueryData(meQuery().queryKey, (me: Me | undefined) =>
        me === undefined ? updated : { ...me, ...sent },
      );
      return 0;
    },
    loadTheirs: () =>
      void queryClient.invalidateQueries({ queryKey: meQuery().queryKey }),
  };
}

interface ProfileValues {
  displayName: string;
}

const profileSpec: RowFieldsSpec<ProfileValues> = {
  errorOf: (_, value) => ruleErrorOf(displayNameSchema, value),
  toWire: (_, value) => value,
  fromWire: (_, value) => String(value ?? ""),
  isChoice: () => false,
};

interface PreferenceValues {
  timezone: string;
  theme: Theme;
}

const preferenceSpec: RowFieldsSpec<PreferenceValues> = {
  errorOf: (field, value) =>
    ruleErrorOf(field === "timezone" ? timeZoneSchema : themeSchema, value),
  toWire: (_, value) => value,
  fromWire: (field, value) =>
    (field === "theme"
      ? themeSchema.catch("system").parse(value)
      : String(value ?? "")) as never,
  isChoice: () => true,
};

/** 4's skeleton: the groups' names and the shapes of their fields. */
export function AccountSkeleton() {
  const { t } = useTranslation(["settings"]);
  const field = (label: string) => <TextField label={label} />;
  return (
    <SettingsPattern
      header={
        <Heading level={1} variant="heading-1-settings">
          {t("settings:account.title")}
        </Heading>
      }
      groups={[
        {
          id: "profile",
          title: t("settings:account.profile.title"),
          content: (
            <>
              {field(t("settings:account.profile.displayName"))}
              {field(t("settings:account.profile.email"))}
            </>
          ),
        },
        {
          id: "password",
          title: t("settings:account.password.title"),
          content: field(t("settings:account.password.new")),
        },
        {
          id: "preferences",
          title: t("settings:account.preferences.title"),
          content: field(t("settings:account.preferences.timeZone")),
        },
      ]}
    />
  );
}

/**
 * 4 Account (design-spec 6.16, pattern H): the profile, saved as it is typed (6.0.2), the
 * password, the time zone and display mode, the workspaces with Leave, Log out and Delete
 * account. Outside any workspace, the frame stands in the one last opened.
 */
export function AccountScreen() {
  const { t } = useTranslation(["settings"]);
  const { me } = useWorkspace();
  useDocumentTitle(t("settings:account.title"));
  const { requestLogOut, confirmation } = useLogOutRequest();
  const ownerships = useOwnerships(me);
  const [isDeleting, setDeleting] = useState(false);
  return (
    <WorkspaceFrame
      current="account"
      saveScope="me:"
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb>{t("settings:account.title")}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      <SettingsPattern
        header={
          <Heading level={1} variant="heading-1-settings">
            {t("settings:account.title")}
          </Heading>
        }
        groups={[
          {
            id: "profile",
            title: t("settings:account.profile.title"),
            description: (
              <Text variant="body-sm" tone="secondary">
                {t("settings:savesOnTheirOwn")}
              </Text>
            ),
            content: <ProfileFields me={me} />,
          },
          {
            id: "password",
            title: t("settings:account.password.title"),
            description: (
              <Text variant="body-sm" tone="secondary">
                {me.hasPassword
                  ? t("settings:account.password.lead")
                  : t("settings:account.password.leadSet")}
              </Text>
            ),
            content: me.hasPassword ? (
              <ChangePasswordForm />
            ) : (
              <SetPasswordForm />
            ),
          },
          {
            id: "preferences",
            title: t("settings:account.preferences.title"),
            description: (
              <Text variant="body-sm" tone="secondary">
                {t("settings:account.preferences.lead")}
              </Text>
            ),
            content: <PreferenceFields me={me} />,
          },
          {
            id: "workspaces",
            title: t("settings:account.workspaces.title"),
            description: (
              <Text variant="body-sm" tone="secondary">
                {t("settings:account.workspaces.lead")}
              </Text>
            ),
            content: <MembershipList me={me} ownerships={ownerships} />,
          },
          {
            id: "log-out",
            title: t("settings:account.logOut.title"),
            description: (
              <Text variant="body-sm" tone="secondary">
                {t("settings:account.logOut.lead")}
              </Text>
            ),
            content: (
              <Flex>
                <Button variant="secondary" onPress={requestLogOut}>
                  {t("settings:account.logOut.title")}
                </Button>
              </Flex>
            ),
          },
          {
            id: "delete",
            title: t("settings:account.delete.title"),
            description: (
              <Text variant="body-sm" tone="secondary">
                {t("settings:account.delete.lead")}
              </Text>
            ),
            content: (
              <DeleteAccountOpener
                me={me}
                ownerships={ownerships}
                onOpen={() => setDeleting(true)}
              />
            ),
          },
        ]}
      />
      {confirmation}
      {isDeleting && (
        <DeleteAccountDialog me={me} onClose={() => setDeleting(false)} />
      )}
    </WorkspaceFrame>
  );
}

/**
 * The photo, the display name and the email (design-spec 6.16 4). The name saves once
 * typing stops or the field is left, without a button; a name against its rule (6.0.8)
 * is not sent and says why. The email is shown, not changed.
 */
function ProfileFields({ me }: { me: Me }) {
  const { t } = useTranslation(["settings"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const target = useMemo(
    () =>
      meTarget(
        queryClient,
        PROFILE_KEY,
        t("settings:account.profile.displayNameNoun"),
      ),
    [queryClient, t],
  );
  const fields = useRowFields(
    target,
    0,
    { displayName: me.displayName },
    profileSpec,
  );
  return (
    <>
      <Stack gap="space-100">
        <Text variant="label">{t("settings:account.profile.photo")}</Text>
        <PhotoField me={me} canRemove />
      </Stack>
      <TextField
        label={t("settings:account.profile.displayName")}
        value={fields.values.displayName}
        onChange={(value) => fields.change("displayName", value)}
        onBlur={() => fields.blur("displayName")}
        errorMessage={fields.errors.displayName}
        autoComplete="name"
        isRequired
        isReadOnly={!isOnline}
      />
      <SaveFailureNote itemKey={PROFILE_KEY} />
      <TextField
        label={t("settings:account.profile.email")}
        value={me.email}
        type="email"
        isReadOnly
      />
    </>
  );
}

/**
 * The time zone names to choose from (design-spec 6.0.8: IANA names, from a list): the
 * browser's, with the user's own when the browser lists it under another name.
 */
function timeZoneItems(current: string) {
  const zones = Intl.supportedValuesOf("timeZone");
  return (zones.includes(current) ? zones : [...zones, current].sort()).map(
    (zone) => ({ id: zone, label: zone }),
  );
}

/** The time zone and the display mode, each saved when chosen (design-spec 6.0.2). */
function PreferenceFields({ me }: { me: Me }) {
  const { t } = useTranslation(["settings"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const target = useMemo(
    () =>
      meTarget(
        queryClient,
        PREFERENCES_KEY,
        t("settings:account.preferences.timeZoneNoun"),
      ),
    [queryClient, t],
  );
  const fields = useRowFields(
    target,
    0,
    { timezone: me.timezone, theme: me.theme },
    preferenceSpec,
  );
  const zones = useMemo(() => timeZoneItems(me.timezone), [me.timezone]);
  const themes = (["system", "light", "dark"] as const).map((theme) => ({
    id: theme,
    label: t(`settings:account.preferences.themeOption.${theme}`),
  }));
  return (
    <>
      <ComboBox
        label={t("settings:account.preferences.timeZone")}
        items={zones}
        value={fields.values.timezone}
        onChange={(value) => {
          if (value !== null) fields.change("timezone", value);
        }}
        isRequired
        isDisabled={!isOnline}
        errorMessage={fields.errors.timezone}
      />
      <Picker
        label={t("settings:account.preferences.theme")}
        items={themes}
        value={fields.values.theme}
        onChange={(value) => {
          if (value !== null) fields.change("theme", value as Theme);
        }}
        isRequired
        isDisabled={!isOnline}
        errorMessage={fields.errors.theme}
      />
      <SaveFailureNote itemKey={PREFERENCES_KEY} />
    </>
  );
}

/**
 * Change password (A8, design-spec 6.16 4): the current password and a new one (6.0.8).
 * A wrong current password says so under its field; the other devices are logged out.
 */
function ChangePasswordForm() {
  const { t } = useTranslation(["settings", "errors"]);
  const formId = useId();
  const isOnline = useIsOnline();
  const [failure, setFailure] = useState<unknown>(null);
  const [refused, setRefused] = useState<
    "currentPassword" | "newPassword" | null
  >(null);
  const oneAtATime = useOneAtATime();
  const sendThrough = useSendThrough();
  const form = useAppForm({
    defaultValues: { currentPassword: "", newPassword: "" },
    listeners: {
      onChange: ({ fieldApi }) =>
        setRefused((field) => (field === fieldApi.name ? null : field)),
    },
    onSubmit: ({ value, formApi }) =>
      oneAtATime(async () => {
        setFailure(null);
        setRefused(null);
        try {
          await sendThrough(() =>
            changePassword(value.currentPassword, value.newPassword),
          );
        } catch (cause) {
          const code = failureCode(cause);
          if (isSessionLost(cause)) return;
          if (code === "INVALID_PASSWORD") setRefused("currentPassword");
          else if (code === "VALIDATION_FAILED") setRefused("newPassword");
          else setFailure(cause);
          return;
        }
        formApi.reset();
        ToastQueue.neutral(t("settings:account.password.changed"), {
          timeout: TOAST_MS,
        });
      }),
  });
  return (
    <form.AppForm>
      <Form
        id={formId}
        aria-label={t("settings:account.password.title")}
        onSubmit={() => void form.handleSubmit()}
      >
        <form.AppField
          name="currentPassword"
          validators={{ onMount: passwordSchema, onChange: passwordSchema }}
        >
          {(field) => (
            <field.TextField
              rejection={
                refused === "currentPassword"
                  ? t("settings:account.password.wrong")
                  : undefined
              }
              label={t("settings:account.password.current")}
              type="password"
              autoComplete="current-password"
              isRequired
              isReadOnly={!isOnline}
            />
          )}
        </form.AppField>
        <form.AppField
          name="newPassword"
          validators={{ onMount: passwordSchema, onChange: passwordSchema }}
        >
          {(field) => (
            <field.TextField
              rejection={
                refused === "newPassword" ? t("errors:input.format") : undefined
              }
              label={t("settings:account.password.new")}
              type="password"
              autoComplete="new-password"
              isRequired
              isReadOnly={!isOnline}
            />
          )}
        </form.AppField>
        {failure !== null && (
          <SendFailure
            error={failure}
            transient="couldNotSave"
            onRetry={() => void form.handleSubmit()}
            isRetryDisabled={!isOnline}
          />
        )}
        <Flex>
          <form.SubmitButton variant="secondary" isDisabled={!isOnline}>
            {t("settings:account.password.change")}
          </form.SubmitButton>
        </Flex>
      </Form>
    </form.AppForm>
  );
}

/**
 * "Log in again" for an account without a password (design-spec 6.16 4): a Google sign-in
 * that comes back to 4, its new session inside the 10 minutes U7 and U8 ask for.
 */
function LogInAgain({ message }: { message: string }) {
  const { t } = useTranslation(["settings"]);
  const isOnline = useIsOnline();
  const [failure, setFailure] = useState<unknown>(null);
  const start = useCallback(() => {
    setFailure(null);
    return continueWithGoogle({
      callbackURL: "/account",
      errorCallbackURL: `/login?${new URLSearchParams({ next: "/account" })}`,
    });
  }, []);
  const { isStarting, startGoogle } = useGoogleStart(start, setFailure);
  return (
    <Stack gap="space-200">
      <InlineAlert variant="notice">
        <Flex gap="space-200" wrap alignItems="center">
          <Text>{message}</Text>
          <Button
            variant="secondary"
            size="S"
            onPress={startGoogle}
            isPending={isStarting}
            isDisabled={!isOnline}
          >
            {t("settings:account.password.logInAgain")}
          </Button>
        </Flex>
      </InlineAlert>
      {failure !== null && (
        <SendFailure
          error={failure}
          onRetry={startGoogle}
          isRetryDisabled={!isOnline}
        />
      )}
    </Stack>
  );
}

/**
 * Set password (U8, design-spec 6.16 4) for an account made with Google: once set, the
 * email and password log in too. Without a sign-in in the last 10 minutes, the way to
 * log in again.
 */
function SetPasswordForm() {
  const { t } = useTranslation(["settings", "errors"]);
  const formId = useId();
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<unknown>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [isRefused, setRefused] = useState(false);
  const oneAtATime = useOneAtATime();
  const sendThrough = useSendThrough();
  const form = useAppForm({
    defaultValues: { newPassword: "" },
    listeners: { onChange: () => setRefused(false) },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        setFailure(null);
        setNeedsSignIn(false);
        setRefused(false);
        try {
          await sendThrough(() =>
            unwrap(
              api().api.v1.me.password.post({
                newPassword: value.newPassword,
              }),
            ),
          );
        } catch (cause) {
          const code = failureCode(cause);
          if (isSessionLost(cause)) return;
          if (code === "REAUTH_REQUIRED") setNeedsSignIn(true);
          else if (code === "VALIDATION_FAILED") setRefused(true);
          else if (code === "PASSWORD_ALREADY_SET") {
            // Set meanwhile (another tab, a reset mail): the form to change it takes over.
            await queryClient.invalidateQueries({
              queryKey: meQuery().queryKey,
            });
          } else setFailure(cause);
          return;
        }
        await queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
        ToastQueue.neutral(t("settings:account.password.setDone"), {
          timeout: TOAST_MS,
        });
      }),
  });
  return (
    <form.AppForm>
      <Form
        id={formId}
        aria-label={t("settings:account.password.title")}
        onSubmit={() => void form.handleSubmit()}
      >
        <form.AppField
          name="newPassword"
          validators={{ onMount: passwordSchema, onChange: passwordSchema }}
        >
          {(field) => (
            <field.TextField
              rejection={isRefused ? t("errors:input.format") : undefined}
              label={t("settings:account.password.new")}
              type="password"
              autoComplete="new-password"
              isRequired
              isReadOnly={!isOnline}
            />
          )}
        </form.AppField>
        {needsSignIn && (
          <LogInAgain message={t("settings:account.password.reauth")} />
        )}
        {failure !== null && (
          <SendFailure
            error={failure}
            transient="couldNotSave"
            onRetry={() => void form.handleSubmit()}
            isRetryDisabled={!isOnline}
          />
        )}
        <Flex>
          <form.SubmitButton variant="secondary" isDisabled={!isOnline}>
            {t("settings:account.password.set")}
          </form.SubmitButton>
        </Flex>
      </Form>
    </form.AppForm>
  );
}

/** What W2 tells of a workspace the user owns. */
interface Ownership {
  /** No other Owner: the user cannot leave it (W3 LAST_OWNER). */
  isOnlyOwner: boolean;
  /** Someone else is in it: as its only Owner, the user cannot delete the account (U7). */
  hasOthers: boolean;
}

/**
 * W2 of each workspace the user owns, by id. A workspace is absent while its W2 loads or
 * when it fails: the API refuses with LAST_OWNER all the same (its last guard).
 */
function useOwnerships(me: Me): ReadonlyMap<string, Ownership> {
  const owned = me.memberships.filter(({ role }) => role === "owner");
  const queries = useQueries({
    queries: owned.map(({ workspace }) => membersQuery(workspace.id)),
  });
  const ownerships = new Map<string, Ownership>();
  owned.forEach(({ workspace }, index) => {
    const items = queries[index]?.data?.items;
    if (items === undefined) return;
    // The user's role as W2 has it: `me` may still be from before a demotion.
    const isOwner = items.some(
      ({ user, role }) => user.id === me.id && role === "owner",
    );
    ownerships.set(workspace.id, {
      isOnlyOwner:
        isOwner && items.filter(({ role }) => role === "owner").length === 1,
      hasOthers: items.length > 1,
    });
  });
  return ownerships;
}

/**
 * The workspaces the user belongs to, with their role (design-spec 6.16 4). Every one but
 * the user's own personal workspace has Leave; the only Owner of one cannot leave it
 * (1.3: shown, unavailable, with why).
 */
function MembershipList({
  me,
  ownerships,
}: {
  me: Me;
  ownerships: ReadonlyMap<string, Ownership>;
}) {
  const { t } = useTranslation(["settings", "common", "app"]);
  const { workspace: current } = useWorkspace();
  const isOnline = useIsOnline();
  const own = ownPersonalId(me);
  const [leaving, setLeaving] = useState<Me["memberships"][number] | null>(
    null,
  );
  return (
    <>
      <SettingsList aria-label={t("settings:account.workspaces.list")}>
        {me.memberships.map((membership) => {
          const { workspace, role } = membership;
          const roleName = t(`common:role.${role}`);
          const canLeave = workspace.id !== own;
          const isOnlyOwner =
            canLeave && ownerships.get(workspace.id)?.isOnlyOwner === true;
          return (
            <SettingsListItem
              key={workspace.id}
              title={workspace.name}
              description={
                workspace.isPersonal
                  ? `${t("settings:account.workspaces.personal")}${t("app:separator")}${roleName}`
                  : roleName
              }
              note={
                isOnlyOwner
                  ? t("settings:account.workspaces.lastOwner")
                  : undefined
              }
              actions={
                canLeave ? (
                  <Button
                    variant="secondary"
                    isQuiet
                    aria-label={t("settings:account.workspaces.leaveOf", {
                      workspace: workspace.name,
                    })}
                    onPress={() => setLeaving(membership)}
                    isDisabled={!isOnline || isOnlyOwner}
                  >
                    {t("settings:account.workspaces.leave")}
                  </Button>
                ) : undefined
              }
            />
          );
        })}
      </SettingsList>
      {leaving !== null && (
        <LeaveWorkspaceDialog
          workspace={leaving.workspace}
          isOpenNow={leaving.workspace.id === current.id}
          personalId={own}
          onClose={() => setLeaving(null)}
        />
      )}
    </>
  );
}

/**
 * Delete account's opener: unavailable, with why and the way to each workspace's 9,
 * while the user is the only Owner of a workspace with someone else in it (design-spec
 * 1.3・6.16「止める条件」).
 */
function DeleteAccountOpener({
  me,
  ownerships,
  onOpen,
}: {
  me: Me;
  ownerships: ReadonlyMap<string, Ownership>;
  onOpen: () => void;
}) {
  const { t } = useTranslation(["settings"]);
  const blocking = me.memberships
    .filter(({ workspace }) => {
      const ownership = ownerships.get(workspace.id);
      return ownership?.isOnlyOwner === true && ownership.hasOthers;
    })
    .map(({ workspace }) => ({ id: workspace.id, name: workspace.name }));
  return (
    <Stack gap="space-200">
      <Flex>
        <Button
          variant="secondary"
          onPress={onOpen}
          isDisabled={blocking.length > 0}
        >
          {t("settings:account.delete.open")}
        </Button>
      </Flex>
      {blocking.length > 0 && (
        <LastOwnerRefusal workspaces={blocking} variant="notice" />
      )}
    </Stack>
  );
}

/** What the API refused the deletion with, shown in the dialog. */
type DeleteRefusal =
  | { kind: "reauth" }
  | { kind: "lastOwner"; workspaces: { id: string; name: string }[] };

const confirmEmailSchema = requiredText(EMAIL_MAX);

/** The workspaces of a LAST_OWNER refusal (SDD 5.4 U7 `error.workspaces`). */
function lastOwnerWorkspaces(error: unknown): { id: string; name: string }[] {
  if (!(error instanceof ApiError) || !Array.isArray(error.detail.workspaces)) {
    return [];
  }
  return error.detail.workspaces.flatMap((item: unknown) => {
    const { id, name } = (item ?? {}) as { id?: unknown; name?: unknown };
    return typeof id === "string" && typeof name === "string"
      ? [{ id, name }]
      : [];
  });
}

/**
 * Delete account (design-spec 6.16「アカウントの削除」): what goes and what stays, the
 * user's email typed again, and their password, or a sign-in in the last 10 minutes for
 * an account without one. The only Owner of a workspace with others in it is sent to
 * that workspace's 9. Deleted, the user is logged out and on 1.
 */
function DeleteAccountDialog({ me, onClose }: { me: Me; onClose: () => void }) {
  const { t } = useTranslation(["settings"]);
  const formId = useId();
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<unknown>(null);
  const [refusal, setRefusal] = useState<DeleteRefusal | null>(null);
  const [wrong, setWrong] = useState<"confirmEmail" | "password" | null>(null);
  const oneAtATime = useOneAtATime();
  const sendThrough = useSendThrough();
  const form = useAppForm({
    defaultValues: { confirmEmail: "", password: "" },
    listeners: {
      onChange: ({ fieldApi }) =>
        setWrong((field) => (field === fieldApi.name ? null : field)),
    },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        setFailure(null);
        setRefusal(null);
        setWrong(null);
        if (!sameEmail(value.confirmEmail.trim(), me.email)) {
          setWrong("confirmEmail");
          return;
        }
        try {
          await sendThrough(() =>
            unwrap(
              api().api.v1.me.delete.post({
                confirmEmail: value.confirmEmail.trim(),
                ...(me.hasPassword ? { password: value.password } : {}),
              }),
            ),
          );
        } catch (cause) {
          const code = failureCode(cause);
          if (isSessionLost(cause)) return;
          if (code === "CONFIRMATION_MISMATCH") setWrong("confirmEmail");
          else if (code === "INVALID_PASSWORD") setWrong("password");
          else if (code === "REAUTH_REQUIRED") setRefusal({ kind: "reauth" });
          else if (code === "LAST_OWNER") {
            const workspaces = lastOwnerWorkspaces(cause);
            setRefusal({ kind: "lastOwner", workspaces });
            // Another Owner left meanwhile: the opener says so too once closed.
            for (const { id } of workspaces) {
              void queryClient.invalidateQueries({
                queryKey: membersQuery(id).queryKey,
              });
            }
          } else setFailure(cause);
          return;
        }
        // The session is gone with the account: nothing of it stays on the page.
        autosave.discardAll();
        queryClient.clear();
        await navigate({ href: "/", replace: true });
      }),
  });
  const deleted = [
    "profile",
    "selfAnalysis",
    "personal",
    "memberships",
    "notifications",
  ] as const;
  const passwordRule = me.hasPassword ? passwordSchema : undefined;
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable
      size="M"
      density="spacious"
      title={t("settings:account.delete.dialogTitle")}
      buttons={
        <form.AppForm>
          <ButtonGroup align="end">
            <Button variant="secondary" onPress={onClose}>
              {t("settings:account.delete.cancel")}
            </Button>
            <form.SubmitButton
              form={formId}
              variant="negative"
              isDisabled={!isOnline}
            >
              {t("settings:account.delete.confirm")}
            </form.SubmitButton>
          </ButtonGroup>
        </form.AppForm>
      }
    >
      <Stack gap="space-300">
        <Text variant="body-long">{t("settings:account.delete.intro")}</Text>
        <DescriptionList>
          <DescriptionListItem
            label={t("settings:account.delete.deletedTitle")}
          >
            <Stack gap="space-75">
              {deleted.map((item) => (
                <Text key={item}>
                  {t(`settings:account.delete.deleted.${item}`)}
                </Text>
              ))}
            </Stack>
          </DescriptionListItem>
          <DescriptionListItem label={t("settings:account.delete.keptTitle")}>
            {t("settings:account.delete.kept")}
          </DescriptionListItem>
        </DescriptionList>
        <form.AppForm>
          <Form id={formId} onSubmit={() => void form.handleSubmit()}>
            <form.AppField
              name="confirmEmail"
              validators={{
                onMount: confirmEmailSchema,
                onChange: confirmEmailSchema,
              }}
            >
              {(field) => (
                <field.TextField
                  rejection={
                    wrong === "confirmEmail"
                      ? t("settings:account.delete.emailMismatch")
                      : undefined
                  }
                  label={t("settings:account.delete.email")}
                  description={t("settings:account.delete.emailHelp", {
                    email: me.email,
                  })}
                  type="email"
                  autoComplete="off"
                  isRequired
                  isReadOnly={!isOnline}
                />
              )}
            </form.AppField>
            {passwordRule !== undefined && (
              <form.AppField
                name="password"
                validators={{ onMount: passwordRule, onChange: passwordRule }}
              >
                {(field) => (
                  <field.TextField
                    rejection={
                      wrong === "password"
                        ? t("settings:account.delete.wrongPassword")
                        : undefined
                    }
                    label={t("settings:account.delete.password")}
                    type="password"
                    autoComplete="current-password"
                    isRequired
                    isReadOnly={!isOnline}
                  />
                )}
              </form.AppField>
            )}
          </Form>
        </form.AppForm>
        {refusal?.kind === "reauth" && (
          <LogInAgain message={t("settings:account.delete.reauth")} />
        )}
        {refusal?.kind === "lastOwner" && (
          <LastOwnerRefusal workspaces={refusal.workspaces} />
        )}
        {failure !== null && (
          <SendFailure
            error={failure}
            transient="couldNotSave"
            onRetry={() => void form.handleSubmit()}
            isRetryDisabled={!isOnline}
          />
        )}
      </Stack>
    </Dialog>
  );
}

/** "Make someone else Owner of BCDX first", with the way to that workspace's 9. */
function LastOwnerRefusal({
  workspaces,
  variant = "negative",
}: {
  workspaces: { id: string; name: string }[];
  /** `notice` before Delete account is pressed; `negative` when the API refused it. */
  variant?: "notice" | "negative";
}) {
  const { t } = useTranslation(["settings"]);
  if (workspaces.length === 0) {
    return (
      <InlineAlert variant={variant}>
        {t("settings:account.workspaces.lastOwner")}
      </InlineAlert>
    );
  }
  const lines: ReactNode[] = workspaces.map(({ id, name }) => (
    <Stack key={id} gap="space-75">
      <Text>{t("settings:account.delete.lastOwner", { workspace: name })}</Text>
      <Link href={settingsHref(id)}>
        {t("settings:account.delete.toSettings", { workspace: name })}
      </Link>
    </Stack>
  ));
  return (
    <InlineAlert variant={variant}>
      <Stack gap="space-200">{lines}</Stack>
    </InlineAlert>
  );
}
