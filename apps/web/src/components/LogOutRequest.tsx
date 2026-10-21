import { AlertDialog } from "@moonx/ui-web";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAutosave } from "../lib/autosave-react";
import { useLogOut } from "./logOut";

/**
 * Log out from the navigation or 4 (design-spec 5章「共通ナビ」): straight away, or with
 * unsaved input after "Log out?" and "Unsaved changes on this page will be lost.".
 * `confirmation` is that question, rendered by the screen while it is asked.
 */
export function useLogOutRequest(): {
  requestLogOut: () => void;
  confirmation: ReactNode;
} {
  const { t } = useTranslation(["app"]);
  const autosave = useAutosave();
  const logOut = useLogOut();
  const [isConfirming, setConfirming] = useState(false);
  return {
    requestLogOut: () => {
      if (autosave.hasUnsaved()) setConfirming(true);
      else logOut();
    },
    confirmation: isConfirming && (
      <AlertDialog
        isOpen
        variant="warning"
        size="S"
        title={t("app:unsaved.logOutTitle")}
        primaryActionLabel={t("app:nav.logOut")}
        cancelLabel={t("app:unsaved.cancel")}
        onPrimaryAction={() => {
          setConfirming(false);
          logOut();
        }}
        onCancel={() => setConfirming(false)}
      >
        {t("app:unsaved.message")}
      </AlertDialog>
    ),
  };
}
