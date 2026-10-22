import i18next, { type i18n as I18n } from "i18next";
import admin from "../locales/en/admin.json";
import ai from "../locales/en/ai.json";
import app from "../locales/en/app.json";
import auth from "../locales/en/auth.json";
import common from "../locales/en/common.json";
import components from "../locales/en/components.json";
import dashboard from "../locales/en/dashboard.json";
import decisions from "../locales/en/decisions.json";
import errors from "../locales/en/errors.json";
import format from "../locales/en/format.json";
import ideas from "../locales/en/ideas.json";
import landing from "../locales/en/landing.json";
import mail from "../locales/en/mail.json";
import notifications from "../locales/en/notifications.json";
import panels from "../locales/en/panels.json";
import pitch from "../locales/en/pitch.json";
import settings from "../locales/en/settings.json";
import validation from "../locales/en/validation.json";

/**
 * The catalogs, one file per namespace under `locales/<lang>/` (SDD 9章). Adding a
 * language adds a directory here; the UI stays English-only until then.
 */
export const resources = {
  en: {
    admin,
    ai,
    app,
    auth,
    common,
    components,
    dashboard,
    decisions,
    errors,
    format,
    ideas,
    landing,
    mail,
    notifications,
    panels,
    pitch,
    settings,
    validation,
  },
} as const;

export const defaultNS = "common";
export const namespaces = Object.keys(
  resources.en,
) as (keyof typeof resources.en)[];

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)["en"];
  }
}

/**
 * A ready i18next instance with every catalog bundled, initialised synchronously so it can
 * be used as soon as it returns. The Web hands it to react-i18next; the API uses it for
 * notification text, PDF headings, AI export headings and mail.
 *
 * Interpolated values are not HTML-escaped: React escapes what it renders, and output
 * that is HTML (mail) escapes in its own template.
 */
export const createI18n = (): I18n => {
  const instance = i18next.createInstance();
  instance.init({
    lng: "en",
    fallbackLng: "en",
    supportedLngs: Object.keys(resources),
    // i18next keeps the object it is given and adds to it in place: each instance gets
    // its own copy, so one adding a resource cannot change another.
    resources: structuredClone(resources),
    ns: namespaces,
    defaultNS,
    initAsync: false,
    interpolation: { escapeValue: false },
  });
  return instance;
};

/** The instance the formatters use, shared by every caller in a process. */
export const i18n = createI18n();
