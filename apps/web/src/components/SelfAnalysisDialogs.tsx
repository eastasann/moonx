import { formatCurrencyOption } from "@moonx/i18n";
import { CURRENCY_CODES, type SelfAnalysisHome } from "@moonx/schemas";
import {
  Button,
  ButtonGroup,
  Checkbox,
  CheckboxGroup,
  Dialog,
  InlineAlert,
  Picker,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, unwrap } from "../lib/api";
import { useIsMounted } from "../lib/mounted";
import { useIsOnline } from "../lib/online";
import {
  commentsKey,
  selfAnalysisHomeQuery,
  selfAnalysisKey,
  workspaceKey,
} from "../lib/queries";
import { useSendThrough } from "../lib/send";
import { useFailureOnceClosed } from "./ideaActions";
import { ModalSendFailure } from "./ModalFailure";
import { failureCode } from "./SendFailure";

/** The refusals of S5 that say why in M6 (SDD 5.8): the self-analysis or a workspace changed. */
const SHARE_REFUSALS = ["MUST_BE_DONE_TO_SHARE", "NOT_SHAREABLE"] as const;

/** Which of {@link SHARE_REFUSALS} `error` is, if any. */
const shareRefusalOf = (error: unknown) => {
  const code = failureCode(error);
  return SHARE_REFUSALS.find((refusal) => refusal === code);
};

/** What M6's Save sends (S5): the workspaces chosen, and those shared with as M6 read them. */
interface SharesSend {
  workspaceIds: string[];
  shared: string[];
}

/**
 * M6 Share (design-spec 3.8・6.11): the team workspaces the user is an Owner or Member of,
 * the ones shared with ticked, and that their Owners and Members, not their Viewers, read
 * it. A workspace is added only once the self-analysis is done; one is taken off at any
 * time. Small; a tray on a phone. Without a team workspace it says to join one (6.0.6).
 * Save on its way holds Cancel and Escape; Back still closes M6, and a Save that then
 * fails says so in a toast (6.0.6「送っている間に閉じた送信の失敗」).
 */
export function ShareDialog({
  home,
  onClose,
}: {
  home: SelfAnalysisHome;
  onClose: () => void;
}) {
  const { t } = useTranslation(["selfAnalysis", "errors"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const shared = home.shares.map(({ workspace }) => workspace.id);
  const [ticked, setTicked] = useState<string[]>(shared);
  const isDone = home.status === "done";
  // A workspace shared with that is no longer shareable (S5 ends such shares) still shows,
  // to be taken off.
  const workspaces = [
    ...home.shareableWorkspaces,
    ...home.shares
      .map(({ workspace }) => workspace)
      .filter(
        (workspace) =>
          !home.shareableWorkspaces.some(({ id }) => id === workspace.id),
      ),
  ];
  // What can be sent now: 10 read again after a refusal may list fewer, or no longer
  // let one be added (6.11), and a tick left on those would be refused every time.
  const chosen = ticked.filter(
    (id) =>
      workspaces.some((workspace) => workspace.id === id) &&
      (isDone || shared.includes(id)),
  );
  const isOpen = useIsMounted();
  // S5 writes no change history (SDD 5.8): no history panel to read again.
  const sendThrough = useSendThrough({ readsHistoryAgain: false });
  const share = async ({ workspaceIds, shared: before }: SharesSend) => {
    const updated = await unwrap(
      api().api.v1.me["self-analysis"].shares.put({ workspaceIds }),
    );
    queryClient.setQueryData(selfAnalysisHomeQuery().queryKey, updated);
    // Who reads it, and whose comments the owner sees, changed in each workspace.
    const changed = new Set([...before, ...workspaceIds]);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: selfAnalysisKey }),
      queryClient.invalidateQueries({ queryKey: commentsKey }),
      ...[...changed].map((id) =>
        queryClient.invalidateQueries({ queryKey: workspaceKey(id) }),
      ),
    ]);
  };
  // Done, or a membership, changed since M6 opened: the choices as they are now.
  const readAgain = () =>
    void queryClient.invalidateQueries({
      queryKey: selfAnalysisHomeQuery().queryKey,
    });
  // A refusal M6 no longer shows (Back closed it while Save was on its way): its words in
  // a toast, as a row's send says a code the screen has words for (6.0.6), 10 read again.
  // No Retry: the same choice is refused again until 10, read again, changes.
  const failureOnceClosed = useFailureOnceClosed(
    (input: SharesSend) => sendThrough(() => share(input)),
    (error) => {
      const refusal = shareRefusalOf(error);
      if (refusal === undefined) return null;
      readAgain();
      return t(`errors:${refusal}`);
    },
  );
  const save = useMutation({
    mutationFn: share,
    meta: { readsHistoryAgain: false },
    onSuccess: () => {
      // Back closed M6 meanwhile: closing again would leave 10.
      if (isOpen.current) onClose();
    },
    onError: (error, input) => {
      // Open, M6 says why; closed, the toast does and reads 10 again itself.
      if (isOpen.current && shareRefusalOf(error) !== undefined) readAgain();
      failureOnceClosed(error, input);
    },
  });
  const send = () => save.mutate({ workspaceIds: chosen, shared });
  const refusal = shareRefusalOf(save.error);
  return (
    <Dialog
      isOpen
      // A send on its way finishes first: closing then would leave twice (useModal).
      onOpenChange={(isOpen) => {
        if (!isOpen && !save.isPending) onClose();
      }}
      size="S"
      density="spacious"
      title={t("selfAnalysis:share.title")}
      buttons={
        <ButtonGroup align="end">
          <Button
            variant="secondary"
            onPress={onClose}
            isDisabled={save.isPending}
          >
            {t("selfAnalysis:share.cancel")}
          </Button>
          {workspaces.length > 0 && (
            <Button
              variant="primary"
              onPress={send}
              isPending={save.isPending}
              isDisabled={!isOnline}
            >
              {t("selfAnalysis:share.save")}
            </Button>
          )}
        </ButtonGroup>
      }
    >
      <Stack gap="space-300">
        {workspaces.length === 0 ? (
          <Text tone="secondary" elementType="p">
            {t("selfAnalysis:share.none")}
          </Text>
        ) : (
          <Text elementType="p">{t("selfAnalysis:share.lead")}</Text>
        )}
        {workspaces.length > 0 && (
          <CheckboxGroup
            label={t("selfAnalysis:share.workspaces")}
            value={chosen}
            onChange={setTicked}
            isReadOnly={!isOnline}
            description={isDone ? undefined : t("selfAnalysis:share.notDone")}
          >
            {workspaces.map((workspace) => (
              <Checkbox
                key={workspace.id}
                value={workspace.id}
                // Before it is done, a share is only taken off (6.11).
                isDisabled={!isDone && !shared.includes(workspace.id)}
              >
                {workspace.name}
              </Checkbox>
            ))}
          </CheckboxGroup>
        )}
        {refusal !== undefined ? (
          <InlineAlert variant="negative">{t(`errors:${refusal}`)}</InlineAlert>
        ) : (
          save.error !== null && (
            <ModalSendFailure
              error={save.error}
              onRetry={send}
              isRetryDisabled={save.isPending || !isOnline}
              onClose={onClose}
            />
          )
        )}
      </Stack>
    </Dialog>
  );
}

/**
 * The self-analysis's currency, from 10's ⋯ (design-spec 6.11「通貨」): the amounts of
 * Q15–17 are in it, and changing it converts none of them, as it says. A setting, saved
 * on Save without a history (SDD 5.8 S1 PATCH). Save on its way holds Cancel and Escape;
 * Back, which leaves 10 as the dialog is not in the URL, does not wait, and a Save that
 * then fails says so in a toast (6.0.6「送っている間に閉じた送信の失敗」).
 */
export function CurrencyDialog({
  home,
  onClose,
}: {
  home: SelfAnalysisHome;
  onClose: () => void;
}) {
  const { t } = useTranslation(["selfAnalysis"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const [currency, setCurrency] = useState(home.currency);
  const currencies = useMemo(
    () =>
      CURRENCY_CODES.map((code) => ({
        id: code,
        label: formatCurrencyOption(code),
      })),
    [],
  );
  // A setting without a history (SDD 5.8 S1 PATCH): no history panel to read again.
  const sendThrough = useSendThrough({ readsHistoryAgain: false });
  const change = async (to: string) => {
    const updated = await unwrap(
      api().api.v1.me["self-analysis"].patch({ currency: to }),
    );
    queryClient.setQueryData(selfAnalysisHomeQuery().queryKey, updated);
    await queryClient.invalidateQueries({ queryKey: selfAnalysisKey });
  };
  // Left 10 while Save was on its way: its failure in a toast (6.0.6).
  const failureOnceClosed = useFailureOnceClosed((to: string) =>
    sendThrough(() => change(to)),
  );
  const save = useMutation({
    mutationFn: change,
    meta: { readsHistoryAgain: false },
    onSuccess: onClose,
    onError: failureOnceClosed,
  });
  return (
    <Dialog
      isOpen
      // A send on its way finishes first: closing then would leave twice (useModal).
      onOpenChange={(isOpen) => {
        if (!isOpen && !save.isPending) onClose();
      }}
      size="S"
      density="spacious"
      title={t("selfAnalysis:currency.title")}
      buttons={
        <ButtonGroup align="end">
          <Button
            variant="secondary"
            onPress={onClose}
            isDisabled={save.isPending}
          >
            {t("selfAnalysis:currency.cancel")}
          </Button>
          <Button
            variant="primary"
            onPress={() => save.mutate(currency)}
            isPending={save.isPending}
            isDisabled={!isOnline}
          >
            {t("selfAnalysis:currency.save")}
          </Button>
        </ButtonGroup>
      }
    >
      <Stack gap="space-300">
        <Picker
          label={t("selfAnalysis:currency.label")}
          items={currencies}
          value={currency}
          onChange={(value) => {
            if (value !== null) setCurrency(value);
          }}
          description={t("selfAnalysis:currency.note")}
          descriptionTone="notice"
          isRequired
          isDisabled={!isOnline}
          width="full"
        />
        {save.error !== null && (
          <ModalSendFailure
            error={save.error}
            onRetry={() => save.mutate(currency)}
            isRetryDisabled={save.isPending || !isOnline}
            onClose={onClose}
          />
        )}
      </Stack>
    </Dialog>
  );
}
