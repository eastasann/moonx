import { AlertBanner, Button } from "@moonx/ui-web";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAddToHomeScreen, useNewVersion } from "../lib/pwa";

/** "A new version of moonx is available." with Reload, closable (design-spec 6.0.6). */
export function useNewVersionBanner(): ReactNode {
  const { t } = useTranslation(["app"]);
  const { isShown, reload, dismiss } = useNewVersion();
  return isShown ? (
    <AlertBanner
      action={
        <Button variant="secondary" size="S" onPress={reload}>
          {t("app:state.reload")}
        </Button>
      }
      onDismiss={dismiss}
    >
      {t("app:state.newVersion")}
    </AlertBanner>
  ) : undefined;
}

/**
 * iPhone Safari's hint to add moonx to the Home Screen, on the signed-in screens only
 * (design-spec 6.0.6).
 */
export function useAddToHomeScreenBanner(): ReactNode {
  const { t } = useTranslation(["app"]);
  const { isShown, dismiss } = useAddToHomeScreen();
  return isShown ? (
    <AlertBanner onDismiss={dismiss}>
      {t("app:state.addToHomeScreen")}
    </AlertBanner>
  ) : undefined;
}
