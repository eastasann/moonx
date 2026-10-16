import { LOCALE } from "@moonx/i18n";
import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components";

/**
 * Holds React Aria to the app's locale. Without it React Aria follows the browser's
 * language, and its own strings (a clear button's label, a picker's placeholder, the
 * calendar) and date order would change with it; the UI is English in the en-PH format
 * (design-spec 1.2).
 */
export function FixedLocale({ children }: { children: ReactNode }) {
  return <I18nProvider locale={LOCALE}>{children}</I18nProvider>;
}
