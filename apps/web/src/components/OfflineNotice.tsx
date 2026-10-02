import { InlineAlert } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { useOnline } from "../lib/online";

/** The notice above the header while offline (design-spec 6.0.2). */
export function OfflineNotice() {
  const { t } = useTranslation("app");
  if (useOnline()) return null;
  return <InlineAlert variant="notice" heading={t("offline")} role="status" />;
}
