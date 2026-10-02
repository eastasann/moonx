import { Button, Checkbox, CheckboxGroup, Dialog, InlineAlert, Stack, Text } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../lib/error-text";
import { useOverlay } from "../lib/overlay";
import {
  type SelfAnalysisHome,
  selfAnalysisHomeQuery,
  useSelfAnalysisActions,
} from "../lib/self-analysis";

/** The workspaces the list offers: where it can be shared now, plus the ones it is shared with. */
function choices(home: SelfAnalysisHome): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const workspace of home.shareableWorkspaces) byId.set(workspace.id, workspace.name);
  for (const { workspace } of home.shares) byId.set(workspace.id, workspace.name);
  return [...byId].map(([id, name]) => ({ id, name }));
}

function ShareForm({ home }: { home: SelfAnalysisHome }) {
  const { t } = useTranslation(["selfAnalysis", "app"]);
  const { closeModal } = useOverlay();
  const { share } = useSelfAnalysisActions();
  const shared = home.shares.map((entry) => entry.workspace.id);
  const [selected, setSelected] = useState<string[]>(shared);
  const options = choices(home);
  const isDone = home.status === "done";
  const changed = selected.length !== shared.length || selected.some((id) => !shared.includes(id));

  return (
    <Dialog
      isOpen
      isDismissable
      isKeyboardDismissDisabled={share.isPending}
      size="medium"
      title={t("selfAnalysis:shareModal.title")}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && closeModal()}
      actions={
        <>
          <Button variant="secondary" onPress={closeModal}>
            {t("selfAnalysis:shareModal.cancel")}
          </Button>
          <Button
            variant="accent"
            isDisabled={!changed}
            isPending={share.isPending}
            pendingLabel={t("app:saving")}
            onPress={() => share.mutate(selected, { onSuccess: closeModal })}
          >
            {t("selfAnalysis:shareModal.save")}
          </Button>
        </>
      }
    >
      <Stack gap="space-200">
        {share.error ? (
          <InlineAlert variant="negative" heading={t("selfAnalysis:shareModal.saveFailed")}>
            {errorText(t, share.error)}
          </InlineAlert>
        ) : null}
        <Text>{t("selfAnalysis:shareModal.body")}</Text>
        {options.length === 0 ? (
          <Text tone="secondary">{t("selfAnalysis:shareModal.noTeam")}</Text>
        ) : (
          <CheckboxGroup
            label={t("selfAnalysis:shareModal.listLabel")}
            value={selected}
            onChange={setSelected}
          >
            {options.map((option) => (
              <Checkbox
                key={option.id}
                value={option.id}
                // Adding a workspace needs a finished analysis; one it is already shared with can always be dropped.
                isDisabled={!isDone && !shared.includes(option.id)}
              >
                {option.name}
              </Checkbox>
            ))}
          </CheckboxGroup>
        )}
        {!isDone && options.length > 0 ? (
          <Text variant="caption" tone="secondary">
            {t("selfAnalysis:shareModal.needsDone")}
          </Text>
        ) : null}
      </Stack>
    </Dialog>
  );
}

/** M6: choose the workspaces a finished self analysis is shared with (design-spec 6.11). */
export function ShareDialog() {
  const { t } = useTranslation(["selfAnalysis", "app"]);
  const { closeModal } = useOverlay();
  const home = useQuery(selfAnalysisHomeQuery);
  if (home.isError && !home.data) {
    return (
      <Dialog
        isOpen
        isDismissable
        size="medium"
        title={t("selfAnalysis:shareModal.title")}
        closeLabel={t("app:close")}
        onOpenChange={(open) => !open && closeModal()}
        actions={
          <Button variant="secondary" onPress={() => void home.refetch()}>
            {t("app:states.retry")}
          </Button>
        }
      >
        <InlineAlert variant="negative" heading={t("app:states.loadError.heading")}>
          {errorText(t, home.error)}
        </InlineAlert>
      </Dialog>
    );
  }
  // Until the first answer arrives there is nothing to choose from, so the sheet opens with it.
  if (!home.data) return null;
  // Keyed by the shares, so the checked boxes follow what the server holds after a save.
  return <ShareForm key={home.data.shares.map((s) => s.workspace.id).join()} home={home.data} />;
}
