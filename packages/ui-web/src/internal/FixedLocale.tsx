import { LOCALE } from "@moonx/i18n";
import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components";

/**
 * Holds React Aria to the app's locale. Without it React Aria follows the browser's
 * language: the date order would change, and so would the strings it builds itself and
 * takes from no prop (Dismiss, the date segments' names and "Empty", its announcements;
 * SDD 9章「React Aria の文言」). The UI is English in the en-PH format (design-spec 1.2).
 */
export function FixedLocale({ children }: { children: ReactNode }) {
  return <I18nProvider locale={LOCALE}>{children}</I18nProvider>;
}
