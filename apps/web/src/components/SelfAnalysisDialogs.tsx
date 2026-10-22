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
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, unwrap } from "../lib/api";
import { useIsOnline } from "../lib/online";
import {
  commentsKey,
  selfAnalysisHomeQuery,
  selfAnalysisKey,
  workspaceKey,
} from "../lib/queries";
import { ModalSendFailure } from "./ModalFailure";
import { failureCode } from "./SendFailure";

/** Whether the component is still on screen, for what settles after it may have gone. */
function useIsOpen() {
  const isOpen = useRef(true);
  useEffect(() => {
    isOpen.current = true;
    return () => {
      isOpen.current = false;
    };
  }, []);
  return isOpen;
}

/** The refusals of S5 that say why in M6 (SDD 5.8): the self-analysis or a workspace changed. */
const SHARE_REFUSALS = ["MUST_BE_DONE_TO_SHARE", "NOT_SHAREABLE"] as const;

/**
 * M6 Share (design-spec 3.8・6.11): the team workspaces the user is an Owner or Member of,
 * the ones shared with ticked, and that their Owners and Members, not their Viewers, read
 * it. A workspace is added only once the self-analysis is done; one is taken off at any
 * time. Small; a tray on a phone. Without a team workspace it says to join one (6.0.6).
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
  const isOpen = useIsOpen();
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api().api.v1.me["self-analysis"].shares.put({ workspaceIds: chosen }),
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(selfAnalysisHomeQuery().queryKey, updated);
      // Who reads it, and whose comments the owner sees, changed in each workspace.
      const changed = new Set([...shared, ...chosen]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: selfAnalysisKey }),
        queryClient.invalidateQueries({ queryKey: commentsKey }),
        ...[...changed].map((id) =>
          queryClient.invalidateQueries({ queryKey: workspaceKey(id) }),
        ),
      ]);
      // Back closed M6 meanwhile: closing again would leave 10.
      if (isOpen.current) onClose();
    },
    onError: (error) => {
      // Done, or a membership, changed since M6 opened: the choices as they are now.
      const code = failureCode(error);
      if (SHARE_REFUSALS.some((refusal) => refusal === code)) {
        void queryClient.invalidateQueries({
          queryKey: selfAnalysisHomeQuery().queryKey,
        });
      }
    },
  });
  const code = failureCode(save.error);
  const refusal = SHARE_REFUSALS.find((candidate) => candidate === code);
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
              onPress={() => save.mutate()}
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
              onRetry={() => save.mutate()}
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
 * on Save without a history (SDD 5.8 S1 PATCH).
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
  const save = useMutation({
    mutationFn: () =>
      unwrap(api().api.v1.me["self-analysis"].patch({ currency })),
    onSuccess: async (updated) => {
      queryClient.setQueryData(selfAnalysisHomeQuery().queryKey, updated);
      await queryClient.invalidateQueries({ queryKey: selfAnalysisKey });
      onClose();
    },
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
            onPress={() => save.mutate()}
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
            onRetry={() => save.mutate()}
            isRetryDisabled={save.isPending || !isOnline}
            onClose={onClose}
          />
        )}
      </Stack>
    </Dialog>
  );
}
