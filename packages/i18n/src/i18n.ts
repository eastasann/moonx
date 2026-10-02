import i18next, { type i18n as I18n } from "i18next";
import common from "../locales/en/common.json";
import errors from "../locales/en/errors.json";
import validation from "../locales/en/validation.json";

/** Catalogs per language. The UI is English only for now (design-spec 1.2); add a language here. */
export const resources = {
  en: { common, errors, validation },
} as const;

export const DEFAULT_LANGUAGE = "en";
export const NAMESPACES = ["common", "errors", "validation"] as const;

/**
 * Creates an i18next instance with the shared catalogs. Web, mobile and the API each create their
 * own so that a request's language never leaks into another.
 */
export function createI18n(language: string = DEFAULT_LANGUAGE): I18n {
  const instance = i18next.createInstance();
  instance.init({
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    ns: [...NAMESPACES],
    defaultNS: "common",
    resources,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}

/** Catalog key for an API error code (SDD 8.1, 9). */
export const errorMessageKey = (code: string) => `errors:${code}`;
