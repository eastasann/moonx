import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * Names the page in the browser's tab and for screen readers (WCAG 2.4.2): "Dashboard ·
 * BCDX · moonx". Leaving the screen gives back the title before it.
 *
 * @param parts From the screen outward: the screen, then where it is. None while the
 * screen has no name of its own (not found, no access): "moonx" (design-spec 6.0.1).
 */
export function useDocumentTitle(...parts: string[]) {
  const { t } = useTranslation(["app"]);
  const title =
    parts.length === 0
      ? t("app:name")
      : t("app:documentTitle", { page: parts.join(t("app:separator")) });
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
