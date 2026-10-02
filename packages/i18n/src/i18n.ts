import i18next, { type i18n as I18n } from "i18next";
import account from "../locales/en/account.json";
import admin from "../locales/en/admin.json";
import ai from "../locales/en/ai.json";
import app from "../locales/en/app.json";
import auth from "../locales/en/auth.json";
import common from "../locales/en/common.json";
import costs from "../locales/en/costs.json";
import dashboard from "../locales/en/dashboard.json";
import decision from "../locales/en/decision.json";
import decisionLog from "../locales/en/decisionLog.json";
import economics from "../locales/en/economics.json";
import errors from "../locales/en/errors.json";
import execution from "../locales/en/execution.json";
import form from "../locales/en/form.json";
import ideas from "../locales/en/ideas.json";
import mail from "../locales/en/mail.json";
import notifications from "../locales/en/notifications.json";
import panels from "../locales/en/panels.json";
import pitch from "../locales/en/pitch.json";
import plan from "../locales/en/plan.json";
import planHome from "../locales/en/planHome.json";
import planItem from "../locales/en/planItem.json";
import research from "../locales/en/research.json";
import selfAnalysis from "../locales/en/selfAnalysis.json";
import templateMigration from "../locales/en/templateMigration.json";
import validation from "../locales/en/validation.json";
import workspaceSettings from "../locales/en/workspaceSettings.json";

/** Catalogs per language. The UI is English only for now (design-spec 1.2); add a language here. */
export const resources = {
  en: {
    account,
    admin,
    ai,
    app,
    auth,
    common,
    costs,
    dashboard,
    decision,
    decisionLog,
    economics,
    errors,
    execution,
    form,
    ideas,
    mail,
    notifications,
    panels,
    pitch,
    plan,
    planHome,
    planItem,
    research,
    selfAnalysis,
    templateMigration,
    validation,
    workspaceSettings,
  },
} as const;

export const DEFAULT_LANGUAGE = "en";
export const NAMESPACES = [
  "account",
  "admin",
  "ai",
  "app",
  "auth",
  "common",
  "costs",
  "dashboard",
  "decision",
  "decisionLog",
  "economics",
  "errors",
  "execution",
  "form",
  "ideas",
  "mail",
  "notifications",
  "panels",
  "pitch",
  "plan",
  "planHome",
  "planItem",
  "research",
  "selfAnalysis",
  "templateMigration",
  "validation",
  "workspaceSettings",
] as const;

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
