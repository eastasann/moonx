import {
  type ConflictCurrent,
  conflictCurrentSchema,
  type GoNoGoValue,
  goNoGoValueSchema,
  type PlanHome,
  type PlanSummary,
  planNameSchema,
  reasonSchema,
  versionNameSchema,
} from "@moonx/schemas";
import {
  Button,
  ButtonGroup,
  DescriptionList,
  DescriptionListItem,
  Dialog,
  Form,
  Heading,
  InlineAlert,
  Link,
  Radio,
  RadioGroup,
  Stack,
  Text,
  TextArea,
  TextField,
  ToastQueue,
} from "@moonx/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ZodType } from "zod";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import type { SaveStatus } from "../lib/autosave";
import { useSaveItem } from "../lib/autosave-react";
import { useOneAtATime } from "../lib/form";
import { inputIssueMessage } from "../lib/input-issues";
import { planHref } from "../lib/links";
import { useIsMounted } from "../lib/mounted";
import { useIsOnline } from "../lib/online";
import {
  archivedPlansQuery,
  goNoGoContextQuery,
  ideaKey,
  planHomeQuery,
  workspaceKey,
} from "../lib/queries";
import { useSendThrough } from "../lib/send";
import { DecisionKeyNumbers } from "./decisionParts";
import { useFailureOnceClosed } from "./ideaActions";
import { ModalSendFailure } from "./ModalFailure";
import { ConflictAlert, conflictTitle } from "./SaveFeedback";
import { failureCode } from "./SendFailure";
import { FailureState, LoadingBlock } from "./states";
import { dashboardHref, useWorkspace } from "./workspace";

/** How long a toast without an action stays: the shortest 4.5 Toast allows. */
const TOAST_MS = 5000;

/**
 * A field and its rule (design-spec 6.0.8): why it breaks the rule shows once it has been
 * typed in, and the dialog's decision stays off while it breaks it (6.0.6「モーダルの共通の
 * 決まり」: not while a required field is empty).
 */
function useCheckedField(schema: ZodType, initial: string) {
  const [value, setValue] = useState(initial);
  const [isTouched, setTouched] = useState(false);
  const issue = schema.safeParse(value).error?.issues[0];
  return {
    value,
    setValue: (next: string) => {
      setValue(next);
      setTouched(true);
    },
    isValid: issue === undefined,
    error:
      isTouched && issue !== undefined ? inputIssueMessage(issue) : undefined,
  };
}

/** The n-th plan's letters: A…Z, then AA, AB… as spreadsheet columns go. */
function letters(index: number): string {
  let rest = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (rest % 26)) + name;
    rest = Math.floor(rest / 26) - 1;
  } while (rest >= 0);
  return name;
}

/**
 * M5's name before it is typed (design-spec 6.12): "Plan A", "Plan B"… the first not
 * used by a plan of the idea. P1 lists the archived plans, which count as used, and
 * leaves out the drafts whose creation was undone, which do not.
 */
export function defaultPlanName(plans: readonly Pick<PlanSummary, "name">[]) {
  const used = new Set(plans.map(({ name }) => name));
  for (let index = 0; ; index += 1) {
    const name = `Plan ${letters(index)}`;
    if (!used.has(name)) return name;
  }
}

/** The idea's plans changed: 13 and 20 read them again, and 5 and 6 the stage. */
function usePlansChanged() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  return (ideaId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ideaKey(ideaId) }),
      queryClient.invalidateQueries({ queryKey: workspaceKey(workspace.id) }),
    ]);
}

/**
 * M5 Create plan draft (design-spec 3.8・6.12): the plan's name, "Plan A" or the next
 * not used, and Create draft, which copies the validation into a draft on the latest
 * plan template and opens its 20 in place of the dialog. Small; a tray on a phone. A
 * name in use says so under the field; a decision no longer Proceed, or no published
 * template, where Create is (6.0.6). Closed while Create draft is on its way, the draft
 * is still made, but its 20 does not open (6.0.6「送っている間に閉じた送信の失敗」).
 */
export function CreatePlanDialog({
  ideaId,
  onClose,
}: {
  ideaId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(["plans", "errors"]);
  const { me } = useWorkspace();
  const plansOptions = archivedPlansQuery(ideaId);
  const plans = useQuery(plansOptions);
  // A send on its way finishes first: closing then would leave twice (useModal).
  const isSending = useRef(false);
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSending.current) onClose();
      }}
      size="S"
      density="spacious"
      title={t("plans:create.title")}
    >
      {plans.data !== undefined ? (
        <CreatePlanForm
          ideaId={ideaId}
          initialName={defaultPlanName(plans.data.items)}
          onClose={onClose}
          onSending={(sending) => {
            isSending.current = sending;
          }}
        />
      ) : plans.isError ? (
        <FailureState
          error={plans.error}
          onRetry={() => void plans.refetch()}
          dashboardHref={dashboardHref(me)}
          headingLevel={3}
          size="S"
        />
      ) : (
        <LoadingBlock waitsFor={[plansOptions]}>
          <Stack gap="space-300">
            <Text>{t("plans:create.body")}</Text>
            <Text>{t("plans:create.name")}</Text>
          </Stack>
        </LoadingBlock>
      )}
    </Dialog>
  );
}

const CREATE_REFUSALS = ["DECISION_NOT_PROCEED", "TEMPLATE_NOT_PUBLISHED"];

/** The codes M5 has its own words for: a name in use, and its refusals. */
const CREATE_WORDED = ["NAME_TAKEN", ...CREATE_REFUSALS];

function CreatePlanForm({
  ideaId,
  initialName,
  onClose,
  onSending,
}: {
  ideaId: string;
  initialName: string;
  onClose: () => void;
  /** Whether Create draft is on its way, while the dialog must stay. */
  onSending: (sending: boolean) => void;
}) {
  const { t } = useTranslation(["plans", "errors"]);
  const { workspace } = useWorkspace();
  const isOnline = useIsOnline();
  const isOpen = useIsMounted();
  const navigate = useNavigate();
  const formId = useId();
  const changed = usePlansChanged();
  const name = useCheckedField(planNameSchema, initialName);
  const post = (value: string) =>
    unwrap(
      api()
        .api.v1.ideas({ ideaId: inPath(ideaId) })
        .plans.post({ name: value }),
    );
  // Back closes M5 while Create draft is on its way (Cancel and Escape wait for it): its
  // failure then says so in a toast, whose Retry makes the draft by the same name. M5's
  // own words say so alone, as sending the same name again meets the same refusal; a
  // decision no longer Proceed reads the screen again, as it does while M5 is open.
  const sendThrough = useSendThrough();
  const failedOnceClosed = useFailureOnceClosed(
    (value: string) =>
      sendThrough(() => post(value)).then(() => changed(ideaId)),
    (error) => {
      const worded = CREATE_WORDED.find(
        (candidate) => candidate === failureCode(error),
      );
      if (worded === undefined) return null;
      if (worded === "DECISION_NOT_PROCEED") void changed(ideaId);
      return t(`errors:${worded as "NAME_TAKEN"}`);
    },
  );
  const create = useMutation({
    mutationFn: post,
    onSuccess: async (plan) => {
      await changed(ideaId);
      // Closed meanwhile: the user stays where closing took them, and the entry they are
      // on now is not replaced.
      if (!isOpen.current) return;
      // In place of M5's entry: Back from 20 leads to the screen under it, not to M5.
      await navigate({
        href: planHref(workspace.id, ideaId, plan.id),
        replace: true,
      });
    },
    onMutate: () => onSending(true),
    onSettled: () => onSending(false),
    onError: (error, value) => {
      // The decision changed since the screen read it: the screen reads it again behind
      // M5, which stays open with the reason until it is closed (SDD 4章). Once closed,
      // the toast's words read it again.
      if (isOpen.current && failureCode(error) === "DECISION_NOT_PROCEED") {
        void changed(ideaId);
      }
      failedOnceClosed(error, value);
    },
  });
  // A second press before the first answer would make a second plan.
  const oneAtATime = useOneAtATime();
  const code = failureCode(create.error);
  const nameTaken = code === "NAME_TAKEN";
  const refusal = CREATE_REFUSALS.find((candidate) => candidate === code);
  const submit = () => {
    if (!name.isValid) return;
    void oneAtATime(() =>
      create.mutateAsync(name.value).then(
        () => {},
        // Shown from the mutation's state.
        () => {},
      ),
    );
  };
  return (
    <Stack gap="space-300">
      <Text elementType="p">{t("plans:create.body")}</Text>
      <Form id={formId} onSubmit={submit}>
        <TextField
          label={t("plans:create.name")}
          value={name.value}
          onChange={(value) => {
            name.setValue(value);
            if (nameTaken) create.reset();
          }}
          errorMessage={nameTaken ? t("errors:NAME_TAKEN") : name.error}
          isRequired
          isReadOnly={!isOnline || create.isPending}
          width="full"
          autoFocus
        />
      </Form>
      {refusal !== undefined && (
        <InlineAlert variant="negative">
          {t(`errors:${refusal as "DECISION_NOT_PROCEED"}`)}
        </InlineAlert>
      )}
      {create.error !== null && !nameTaken && refusal === undefined && (
        <ModalSendFailure
          error={create.error}
          onRetry={submit}
          isRetryDisabled={!isOnline || create.isPending}
          onClose={onClose}
        />
      )}
      <ButtonGroup align="end">
        <Button
          variant="secondary"
          onPress={onClose}
          isDisabled={create.isPending}
        >
          {t("plans:create.cancel")}
        </Button>
        <Button
          variant="primary"
          type="submit"
          form={formId}
          isPending={create.isPending}
          isDisabled={!isOnline || !name.isValid || refusal !== undefined}
        >
          {t("plans:create.create")}
        </Button>
      </ButtonGroup>
    </Stack>
  );
}

/** The autosave key of 20's header (Business Name and Prepared by), which Rename plan also writes. */
export const planHeaderKey = (planId: string) => `plan:${planId}`;

const SAVE_ON_ITS_WAY: readonly SaveStatus[] = [
  "waiting",
  "saving",
  "retrying",
];

/** The header someone else saved first, from a P2 PATCH's CONFLICT (6.0.2), if it says. */
const theirHeader = (error: unknown): ConflictCurrent | undefined =>
  error instanceof ApiError && error.code === "CONFLICT"
    ? conflictCurrentSchema.safeParse(error.detail.current).data
    : undefined;

/**
 * Rename plan from 20's ⋯ (design-spec 6.12, 6.0.8 案の名前): the name, unique within the
 * idea, saved with Save (P2 PATCH). Someone else's change to the header since the dialog
 * opened asks as 6.0.2 does: overwrite (only the name is sent) or load theirs. Small; a tray on a
 * phone.
 */
export function RenamePlanDialog({
  home,
  onClose,
}: {
  home: PlanHome;
  onClose: () => void;
}) {
  const { t } = useTranslation(["plans", "errors", "app"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const isOpen = useIsMounted();
  const formId = useId();
  const changed = usePlansChanged();
  const { me } = useWorkspace();
  const name = useCheckedField(planNameSchema, home.name);
  // Save waits for the header's own save on its way, so it sends the version that save
  // leaves (the effect below), not one this user's save has already moved past.
  const headerSave = useSaveItem(planHeaderKey(home.id));
  const isHeaderSaving =
    headerSave !== undefined && SAVE_ON_ITS_WAY.includes(headerSave.status);
  // The header as the dialog opened on it: 20 may read the plan again while it is open,
  // and another person's change since then must still ask (6.0.2). This user's own saves
  // (Business Name and Prepared by on this page or in another tab) while it is open, one
  // version at a time, move it on.
  const [openedOn, setOpenedOn] = useState(home.lockVersion);
  useEffect(() => {
    if (home.updatedBy?.id === me.id && home.lockVersion === openedOn + 1) {
      setOpenedOn(home.lockVersion);
    }
  }, [home.lockVersion, home.updatedBy?.id, me.id, openedOn]);
  const [force, setForce] = useState(false);
  const post = ({
    value,
    overwrite,
    lockVersion,
  }: {
    value: string;
    overwrite: boolean;
    lockVersion: number;
  }) =>
    unwrap(
      api()
        .api.v1.plans({ planId: inPath(home.id) })
        .patch({
          name: value,
          lockVersion,
          ...(overwrite ? { force: true } : {}),
        }),
    );
  const renamed = async (updated: Awaited<ReturnType<typeof post>>) => {
    queryClient.setQueryData(
      planHomeQuery(home.ideaId, home.id).queryKey,
      updated,
    );
    await changed(home.ideaId);
  };
  // Back leaves 20, or opens another of its entries, while Save is on its way (Cancel and
  // Escape wait for it): its failure then says so in a toast, whose Retry sends the same
  // name on the same version. A name in use says so alone, as sending it again meets the
  // same refusal; so does someone else's header saved first, in the words of the question
  // it would have asked (the ConflictAlert below), with 20 read again to show theirs.
  const sendThrough = useSendThrough();
  const failedOnceClosed = useFailureOnceClosed(
    (input: Parameters<typeof post>[0]) =>
      sendThrough(() => post(input)).then(renamed),
    (failure) => {
      if (failureCode(failure) === "NAME_TAKEN") return t("errors:NAME_TAKEN");
      const theirs = theirHeader(failure);
      if (theirs === undefined) return null;
      void changed(home.ideaId);
      return conflictTitle(t("plans:home.headerNoun"), theirs, me.timezone);
    },
  );
  const rename = useMutation({
    mutationFn: post,
    onSuccess: async (updated) => {
      await renamed(updated);
      if (isOpen.current) onClose();
    },
    onError: (error, input) => failedOnceClosed(error, input),
  });
  const error = rename.error;
  const nameTaken = failureCode(error) === "NAME_TAKEN";
  const oneAtATime = useOneAtATime();
  const send = (overwrite: boolean) => {
    if (!name.isValid || isHeaderSaving) return;
    setForce(overwrite);
    void oneAtATime(() =>
      rename
        .mutateAsync({ value: name.value, overwrite, lockVersion: openedOn })
        .then(
          () => {},
          // Shown from the mutation's state.
          () => {},
        ),
    );
  };
  const current = theirHeader(error);
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !rename.isPending) onClose();
      }}
      size="S"
      density="spacious"
      title={t("plans:rename.title")}
      buttons={
        <ButtonGroup align="end">
          <Button
            variant="secondary"
            onPress={onClose}
            isDisabled={rename.isPending}
          >
            {t("plans:rename.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            isPending={rename.isPending}
            isDisabled={!isOnline || !name.isValid || isHeaderSaving}
          >
            {t("plans:rename.save")}
          </Button>
        </ButtonGroup>
      }
    >
      <Form id={formId} onSubmit={() => send(false)}>
        <TextField
          label={t("plans:rename.name")}
          value={name.value}
          onChange={(value) => {
            name.setValue(value);
            if (nameTaken) rename.reset();
          }}
          errorMessage={nameTaken ? t("errors:NAME_TAKEN") : name.error}
          isRequired
          isReadOnly={!isOnline || rename.isPending}
          width="full"
          autoFocus
        />
      </Form>
      {error !== null && !nameTaken && current === undefined && (
        <ModalSendFailure
          error={error}
          onRetry={() => send(force)}
          isRetryDisabled={!isOnline || rename.isPending}
          onClose={onClose}
        />
      )}
      {current !== undefined && (
        <ConflictAlert
          noun={t("plans:home.headerNoun")}
          current={current}
          input={name.value}
          onOverwrite={() => send(true)}
          onLoadTheirs={() => {
            rename.reset();
            void queryClient.invalidateQueries({
              queryKey: planHomeQuery(home.ideaId, home.id).queryKey,
            });
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}

/**
 * M3 Save version (design-spec 3.8・6.12): the version's name, "v{n}" for the next, and
 * Save version, which keeps the plan as it is now, records it in the decision log and
 * tells the workspace. Small; a tray on a phone.
 */
export function SaveVersionDialog({
  home,
  onClose,
}: {
  home: PlanHome;
  onClose: () => void;
}) {
  const { t } = useTranslation(["plans"]);
  const isOnline = useIsOnline();
  const isOpen = useIsMounted();
  const formId = useId();
  const changed = usePlansChanged();
  const next = (home.versions[0]?.versionNumber ?? 0) + 1;
  const name = useCheckedField(versionNameSchema, `v${next}`);
  const post = (value: string) =>
    unwrap(
      api()
        .api.v1.plans({ planId: inPath(home.id) })
        .versions.post({ name: value }),
    );
  const saved = async (version: Awaited<ReturnType<typeof post>>) => {
    // 20's Version and Versions, 13's plans, 7 and 5's activity.
    await changed(home.ideaId);
    ToastQueue.neutral(t("plans:version.saved", { name: version.name }), {
      timeout: TOAST_MS,
    });
  };
  // Back closes M3 while Save version is on its way (Cancel and Escape wait for it): its
  // failure then says so in a toast, whose Retry saves the version by the same name.
  const sendThrough = useSendThrough();
  const failedOnceClosed = useFailureOnceClosed((value: string) =>
    sendThrough(() => post(value)).then(saved),
  );
  const save = useMutation({
    mutationFn: post,
    onSuccess: async (version) => {
      await saved(version);
      if (isOpen.current) onClose();
    },
    onError: (error, value) => failedOnceClosed(error, value),
  });
  // A second press before the first answer would save a second version.
  const oneAtATime = useOneAtATime();
  const submit = () => {
    if (!name.isValid) return;
    void oneAtATime(() =>
      save.mutateAsync(name.value).then(
        () => {},
        // Shown from the mutation's state.
        () => {},
      ),
    );
  };
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
      size="S"
      density="spacious"
      title={t("plans:version.title")}
      buttons={
        <ButtonGroup align="end">
          <Button
            variant="secondary"
            onPress={onClose}
            isDisabled={save.isPending}
          >
            {t("plans:version.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            isPending={save.isPending}
            isDisabled={!isOnline || !name.isValid}
          >
            {t("plans:version.save")}
          </Button>
        </ButtonGroup>
      }
    >
      <Stack gap="space-300">
        <Text elementType="p">{t("plans:version.body")}</Text>
        <Form id={formId} onSubmit={submit}>
          <TextField
            label={t("plans:version.name")}
            value={name.value}
            onChange={name.setValue}
            errorMessage={name.error}
            isRequired
            isReadOnly={!isOnline || save.isPending}
            width="full"
            autoFocus
          />
        </Form>
        {save.error !== null && (
          <ModalSendFailure
            error={save.error}
            onRetry={submit}
            isRetryDisabled={!isOnline || save.isPending}
            onClose={onClose}
          />
        )}
      </Stack>
    </Dialog>
  );
}

/** §24's three conditions as M4 names them; "Empty" where nothing is written. */
function Conditions({
  conditions,
}: {
  conditions: {
    launchIf: string | null;
    delayIf: string | null;
    stopIf: string | null;
  };
}) {
  const { t } = useTranslation(["plans"]);
  return (
    <DescriptionList>
      {(["launchIf", "delayIf", "stopIf"] as const).map((key) => (
        <DescriptionListItem key={key} label={t(`plans:goNoGo.${key}`)}>
          {conditions[key] ?? (
            <Text tone="tertiary">{t("plans:goNoGo.empty")}</Text>
          )}
        </DescriptionListItem>
      ))}
    </DescriptionList>
  );
}

/** What M4 has chosen and written, kept by the screen while M3 opens from it. */
export interface GoNoGoDraft {
  value: GoNoGoValue | null;
  reason: string;
}

export const emptyGoNoGoDraft: GoNoGoDraft = { value: null, reason: "" };

/**
 * M4 Record Go / No-Go (design-spec 3.8・6.12): what it is recorded against (§24's
 * conditions, the key numbers, the version, and "Save a version first?" with the way to
 * M3 while the plan has changed since its latest version), then Launch / Delay / Stop as
 * cards and Why?, both required. Record adds it to the decision log, where the latest
 * counts. Large; a full-screen sheet on a phone. The choice and the reason live in the
 * screen (`draft`), so they are there again when M3, opened from here, closes.
 */
export function GoNoGoDialog({
  home,
  draft,
  onDraftChange,
  onClose,
  onSaveVersion,
}: {
  home: PlanHome;
  draft: GoNoGoDraft;
  onDraftChange: (draft: GoNoGoDraft) => void;
  onClose: () => void;
  /** Opens M3 in M4's place; closing M3 comes back to M4 (6.12). */
  onSaveVersion: () => void;
}) {
  const { t } = useTranslation(["plans", "common", "errors"]);
  const { me, workspace } = useWorkspace();
  const isOnline = useIsOnline();
  const isOpen = useIsMounted();
  const changed = usePlansChanged();
  const contextOptions = goNoGoContextQuery(home.ideaId, home.id);
  const context = useQuery(contextOptions);
  const { value, reason } = draft;
  const setValue = (next: GoNoGoValue) =>
    onDraftChange({ ...draft, value: next });
  const setReason = (next: string) => {
    setReasonTouched(true);
    onDraftChange({ ...draft, reason: next });
  };
  const [isReasonTouched, setReasonTouched] = useState(draft.reason !== "");
  const post = (input: { value: GoNoGoValue; reason: string }) =>
    unwrap(
      api()
        .api.v1.plans({ planId: inPath(home.id) })
        ["go-no-go"].post(input),
    );
  const recorded = async () => {
    // The idea's stage may move to Launch prep (6.12): 13, 5 and 6 follow.
    await changed(home.ideaId);
    ToastQueue.neutral(t("plans:goNoGo.recorded"), { timeout: TOAST_MS });
  };
  // Back closes M4 while Record is on its way (Cancel and Escape wait for it), as does
  // its Save a version: its failure then says so in a toast, whose Retry records the
  // same choice and reason.
  const sendThrough = useSendThrough();
  const failedOnceClosed = useFailureOnceClosed(
    (input: Parameters<typeof post>[0]) =>
      sendThrough(() => post(input)).then(recorded),
  );
  const record = useMutation({
    mutationFn: post,
    onSuccess: async () => {
      await recorded();
      if (isOpen.current) onClose();
    },
    onError: (error, input) => failedOnceClosed(error, input),
  });
  const reasonIssue = reasonSchema.safeParse(reason).error?.issues[0];
  // Both are required: Record waits for them (6.0.6「モーダルの共通の決まり」).
  const canRecord = value !== null && reasonIssue === undefined;
  // A second press before the first answer would record it twice.
  const oneAtATime = useOneAtATime();
  const submit = () => {
    if (value === null || reasonIssue !== undefined) return;
    void oneAtATime(() =>
      record.mutateAsync({ value, reason }).then(
        () => {},
        // Shown from the mutation's state.
        () => {},
      ),
    );
  };
  let material: ReactNode;
  if (context.data !== undefined) {
    const { conditions, keyMetrics, currentVersion, hasChangesSinceVersion } =
      context.data;
    material = (
      <Stack gap="space-300">
        <Stack gap="space-100">
          <Heading level={3} variant="label">
            {t("plans:goNoGo.conditions")}
          </Heading>
          <Conditions conditions={conditions} />
        </Stack>
        <Stack gap="space-100">
          <Heading level={3} variant="label">
            {t("plans:goNoGo.keyNumbers")}
          </Heading>
          <DecisionKeyNumbers
            keyMetrics={keyMetrics}
            currency={workspace.currency}
            aria-label={t("plans:goNoGo.keyNumbers")}
          />
        </Stack>
        <Stack gap="space-100">
          <Heading level={3} variant="label">
            {t("plans:goNoGo.version")}
          </Heading>
          <Text>{currentVersion?.name ?? t("plans:goNoGo.noVersion")}</Text>
          {currentVersion !== null && hasChangesSinceVersion && (
            <InlineAlert variant="notice">
              <Stack gap="space-100">
                <Text>
                  {t("plans:goNoGo.changes", { name: currentVersion.name })}
                </Text>
                <Link onPress={onSaveVersion}>
                  {t("plans:goNoGo.saveFirst")}
                </Link>
              </Stack>
            </InlineAlert>
          )}
        </Stack>
      </Stack>
    );
  } else if (context.isError) {
    material = (
      <FailureState
        error={context.error}
        onRetry={() => void context.refetch()}
        dashboardHref={dashboardHref(me)}
        headingLevel={3}
        size="S"
      />
    );
  } else {
    material = (
      <LoadingBlock waitsFor={[contextOptions]}>
        <Stack gap="space-300">
          <Heading level={3} variant="label">
            {t("plans:goNoGo.conditions")}
          </Heading>
          <Text>{t("plans:goNoGo.launchIf")}</Text>
          <Text>{t("plans:goNoGo.delayIf")}</Text>
        </Stack>
      </LoadingBlock>
    );
  }
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !record.isPending) onClose();
      }}
      size="L"
      density="spacious"
      title={t("plans:goNoGo.title")}
      buttons={
        <ButtonGroup align="end">
          <Button
            variant="secondary"
            onPress={onClose}
            isDisabled={record.isPending}
          >
            {t("plans:goNoGo.cancel")}
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            isPending={record.isPending}
            isDisabled={!isOnline || !canRecord}
          >
            {t("plans:goNoGo.record")}
          </Button>
        </ButtonGroup>
      }
    >
      <Stack gap="space-400">
        {material}
        <RadioGroup
          label={t("plans:goNoGo.question")}
          variant="cards"
          value={value ?? ""}
          onChange={(next) => setValue(goNoGoValueSchema.parse(next))}
          isRequired
          isDisabled={record.isPending}
        >
          {goNoGoValueSchema.options.map((option) => (
            <Radio key={option} value={option}>
              {t(`common:goNoGo.${option}`)}
            </Radio>
          ))}
        </RadioGroup>
        <TextArea
          label={t("plans:goNoGo.why")}
          isRequired
          isReason
          value={reason}
          onChange={setReason}
          errorMessage={
            isReasonTouched && reasonIssue !== undefined
              ? inputIssueMessage(reasonIssue)
              : undefined
          }
          isReadOnly={record.isPending}
          width="full"
        />
        {record.error !== null && (
          <ModalSendFailure
            error={record.error}
            onRetry={submit}
            isRetryDisabled={!isOnline || record.isPending}
            onClose={onClose}
          />
        )}
      </Stack>
    </Dialog>
  );
}
