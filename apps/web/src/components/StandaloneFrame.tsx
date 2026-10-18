import { AlertBanner, PageFrame } from "@moonx/ui-web";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useIsReachable } from "../lib/online";

/** The offline band across the top of a screen (design-spec 6.0.6「オフライン」). */
export function useOfflineBanner(): ReactNode {
  const { t } = useTranslation(["app"]);
  const isReachable = useIsReachable();
  return isReachable ? undefined : (
    <AlertBanner variant="notice">{t("app:state.offline")}</AlertBanner>
  );
}

/**
 * The screens without AppFrame (1, 2 and 3, design-spec 4.5 PageFrame), with the offline
 * band over them.
 */
export function StandaloneFrame({ children }: { children: ReactNode }) {
  const offline = useOfflineBanner();
  return (
    <PageFrame banners={offline === undefined ? undefined : { offline }}>
      {children}
    </PageFrame>
  );
}
