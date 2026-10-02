import { Button, StatusLight } from "@moonx/ui-web";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { saveStatus, useSaveState } from "../lib/save-status";

/**
 * "Saving… / Saved / Couldn't save — Retry" at the end of the header (design-spec 6.0.2). The
 * frame gives it a new `key` for each screen, so "Saved" from the last screen is cleared on arrival.
 */
export function SaveStatus() {
  const { t } = useTranslation("app");
  const state = useSaveState();
  useEffect(() => saveStatus.reset(), []);
  return (
    <span aria-live="polite">
      {state.status === "saving" ? (
        <StatusLight variant="informative">{t("saveState.saving")}</StatusLight>
      ) : null}
      {state.status === "saved" ? (
        <StatusLight variant="positive">{t("saveState.saved")}</StatusLight>
      ) : null}
      {state.status === "error" ? (
        <>
          <StatusLight variant="negative">{t("saveState.failed")}</StatusLight>
          <Button variant="secondary" size="S" onPress={state.retry}>
            {t("saveState.retry")}
          </Button>
        </>
      ) : null}
    </span>
  );
}
