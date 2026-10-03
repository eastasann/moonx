import type { InvitationPreview } from "@moonx/schemas";
import {
  Avatar,
  Badge,
  Button,
  FileTrigger,
  Form,
  Heading,
  InlineAlert,
  PageFrame,
  Picker,
  PickerItem,
  Skeleton,
  Stack,
  Steps,
  StepsPattern,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Redirect } from "../components/Redirect";
import { QueryBoundary } from "../components/states";
import { profileSchema } from "../forms/schemas";
import { api, call } from "../lib/api";
import { isApiError } from "../lib/api-error";
import { errorText } from "../lib/error-text";
import { fieldProps, validate } from "../lib/form";
import { invitationQuery } from "../lib/invitation";
import { useGoTo } from "../lib/navigate";
import { PHOTO_TYPES, usePhotoUpload } from "../lib/photo";
import { homePath, ME_KEY, useMe } from "../lib/session";
import { deviceTimezone, timezoneOptions } from "../lib/timezones";
import { toasts } from "../lib/toast";

export type WelcomeStep = "invite" | "profile" | "done";

/** An invitation that was already accepted: say so and open the workspace (design-spec 6.16). */
function AlreadyAccepted({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation("auth");
  useEffect(() => {
    toasts.add({ title: t("invite.accepted"), variant: "informative" });
  }, [t]);
  return <Redirect to={`/w/${workspaceId}`} />;
}

/** Step 1: the invitation's content and the Join button (design-spec 6.16, screen 3). */
function InviteStep({ token, isNewAccount }: { token: string; isNewAccount: boolean }) {
  const { t } = useTranslation(["auth", "app", "account"]);
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const query = useQuery(invitationQuery(token));

  const join = useMutation({
    mutationFn: async () => {
      // A first attempt whose second call failed leaves the invitation accepted; pressing Join
      // again then goes on from there instead of stopping at "already accepted".
      const result = await call(
        api().api.v1.invitations["by-token"]({ token }).accept.post(),
      ).catch((error: unknown) => {
        const workspace = query.data?.workspace;
        if (isApiError(error) && error.code === "INVITATION_ALREADY_ACCEPTED" && workspace) {
          return { workspaceId: workspace.id, alreadyMember: false };
        }
        throw error;
      });
      // Accepting does not change the last workspace; the first screen after onboarding is the
      // one invited to (design-spec 5, "after login").
      if (result.workspaceId) {
        await call(api().api.v1.me.patch({ lastWorkspaceId: result.workspaceId }));
      }
      return result;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      if (result.alreadyMember && result.workspaceId) {
        toasts.add({ title: t("auth:welcome.alreadyMember"), variant: "informative" });
        goTo(`/w/${result.workspaceId}`);
      } else if (isNewAccount || !result.workspaceId) {
        goTo("/welcome?step=profile&new=1");
      } else {
        // Someone who already had an account has nothing left to set up (design-spec 6.16).
        goTo(`/w/${result.workspaceId}`);
      }
    },
  });

  const content = (invitation: InvitationPreview) => {
    // An invitation without a workspace is accepted when they register, so there is nothing to join.
    if (invitation.status === "accepted" && !invitation.workspace) {
      return <Redirect to="/welcome?step=profile" />;
    }
    if (invitation.status === "accepted" && invitation.workspace) {
      return <AlreadyAccepted workspaceId={invitation.workspace.id} />;
    }
    return (
      <Stack gap="space-300" align="start">
        {invitation.workspace ? (
          <Stack gap="space-100">
            <Heading level={2}>{invitation.workspace.name}</Heading>
            {invitation.role ? <Badge>{t(`account:role.${invitation.role}`)}</Badge> : null}
            {invitation.invitedBy ? (
              <Text tone="secondary">
                {t("auth:invite.invitedBy", { name: invitation.invitedBy.displayName })}
              </Text>
            ) : null}
          </Stack>
        ) : null}

        {join.error ? <InlineAlert variant="negative" heading={errorText(t, join.error)} /> : null}
        <Button
          variant="accent"
          isPending={join.isPending}
          pendingLabel={t("app:saving")}
          onPress={() => join.mutate()}
        >
          {t("auth:welcome.join")}
        </Button>
      </Stack>
    );
  };

  return (
    <QueryBoundary query={query} skeleton={<Skeleton shape="block" height="space-700" />}>
      {content}
    </QueryBoundary>
  );
}

/** Step 2: name, optional photo, and the time zone taken from the device. */
function ProfileStep({ withInvite }: { withInvite: boolean }) {
  const { t } = useTranslation(["auth", "app", "account"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const zones = useMemo(() => timezoneOptions(deviceTimezone()), []);
  const { upload, photoError } = usePhotoUpload();

  const save = useMutation({
    mutationFn: (value: { displayName: string; timezone: string }) =>
      call(
        api().api.v1.me.patch({ displayName: value.displayName.trim(), timezone: value.timezone }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(ME_KEY, updated);
      goTo(withInvite ? "/welcome?step=done&new=1" : "/welcome?step=done");
    },
  });
  const form = useForm({
    // A Google sign-up carries no time zone, so the device's is the default here (design-spec 6.16).
    defaultValues: { displayName: me.displayName, timezone: deviceTimezone() },
    validators: { onSubmit: validate(profileSchema, t) },
    onSubmit: ({ value }) => save.mutateAsync(value).catch(() => {}),
  });

  return (
    <Stack gap="space-300">
      <Heading level={2}>{t("auth:welcome.profileTitle")}</Heading>
      {save.error ? <InlineAlert variant="negative" heading={errorText(t, save.error)} /> : null}
      {photoError ? <InlineAlert variant="negative" heading={errorText(t, photoError)} /> : null}
      <Stack gap="space-100" align="start">
        <Avatar name={me.displayName} src={me.avatarUrl} />
        <FileTrigger
          acceptedFileTypes={PHOTO_TYPES}
          onSelect={(files) => files[0] && upload.mutate(files[0])}
        >
          <Button variant="secondary" isPending={upload.isPending} pendingLabel={t("app:saving")}>
            {t("account:profile.choosePhoto")}
          </Button>
        </FileTrigger>
        <Text variant="caption" tone="secondary">
          {t("account:profile.photoHint")}
        </Text>
      </Stack>
      <Form
        aria-label={t("auth:welcome.profileTitle")}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="displayName">
          {(field) => (
            <TextField
              label={t("auth:fields.displayName")}
              autoComplete="name"
              isRequired
              {...fieldProps(field)}
            />
          )}
        </form.Field>
        <form.Field name="timezone">
          {(field) => (
            <Picker
              label={t("account:preferences.timezone")}
              value={field.state.value}
              onChange={(value) => value && field.handleChange(value)}
            >
              {zones.map((zone) => (
                <PickerItem key={zone} id={zone}>
                  {zone}
                </PickerItem>
              ))}
            </Picker>
          )}
        </form.Field>
        <Button
          type="submit"
          variant="accent"
          isPending={save.isPending}
          pendingLabel={t("app:saving")}
        >
          {t("auth:welcome.continue")}
        </Button>
      </Form>
    </Stack>
  );
}

/** Step 3: done. The button opens the workspace the person was invited to. */
function DoneStep() {
  const { t } = useTranslation("auth");
  const me = useMe();
  const goTo = useGoTo();
  return (
    <Stack gap="space-300" align="start">
      <Heading level={2}>{t("welcome.doneTitle")}</Heading>
      <Text variant="body-long">{t("welcome.doneBody")}</Text>
      <Button variant="accent" onPress={() => goTo(homePath(me))}>
        {t("welcome.toDashboard")}
      </Button>
    </Stack>
  );
}

/**
 * Screen 3, onboarding (design-spec 6.16). A new account goes through the invitation, the profile
 * and done; an invitation without a workspace starts at the profile; a person who already had an
 * account sees the invitation only. The step comes from `?step=`; a link with a token and no step
 * starts at the invitation. The step indicator lists only the steps of that flow.
 */
export function Welcome({
  step,
  token,
  isNewAccount = false,
}: {
  step?: WelcomeStep;
  token?: string;
  isNewAccount?: boolean;
}) {
  const { t } = useTranslation(["auth", "app"]);
  const showsInvite = Boolean(token) && (step === undefined || step === "invite");
  const current: WelcomeStep = step ?? (showsInvite ? "invite" : "profile");
  const ids: WelcomeStep[] = isNewAccount
    ? ["invite", "profile", "done"]
    : showsInvite
      ? ["invite"]
      : ["profile", "done"];
  return (
    <PageFrame>
      <StepsPattern
        hasTabBar={false}
        header={<Heading level={1}>{t("welcome.title")}</Heading>}
        steps={
          <Steps
            aria-label={t("welcome.stepsLabel")}
            current={current === "invite" && !showsInvite ? "profile" : current}
            doneLabel={t("app:stepDone")}
            items={ids.map((id) => ({ id, label: t(`welcome.steps.${id}`) }))}
          />
        }
      >
        {current === "invite" && token ? (
          <InviteStep token={token} isNewAccount={isNewAccount} />
        ) : null}
        {current === "invite" && !token ? <ProfileStep withInvite={isNewAccount} /> : null}
        {current === "profile" ? <ProfileStep withInvite={isNewAccount} /> : null}
        {current === "done" ? <DoneStep /> : null}
      </StepsPattern>
    </PageFrame>
  );
}
