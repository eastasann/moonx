import type { ValidationAnswer } from "@moonx/schemas";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, vi } from "vitest";
import { autosave } from "../src/lib/autosave";
import {
  answer,
  answers01,
  answers02,
  IDEA_ID,
  idea,
  section01,
  section02,
  VALIDATION_ID,
} from "./question-fixtures";
import { type Handler, makeMe, stubApi, WORKSPACE } from "./support";

export const ME = makeMe();
export const PATH = (section = "01", search = "") =>
  `/w/${WORKSPACE}/ideas/${IDEA_ID}/questions/${section}${search}`;
export const ANSWER = (key: string) => `PUT /api/v1/validations/${VALIDATION_ID}/answers/${key}`;

/** Registers the hooks every question-form test file needs. */
export function registerQuestionFormHooks() {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(async () => {
    await autosave.idle();
    await autosave.clear();
    onlineManager.setOnline(true);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
}

export function api(
  extra: Record<string, Handler> = {},
  options: { me?: typeof ME; archived?: boolean } = {},
) {
  const me = options.me ?? ME;
  return stubApi({
    "GET /api/v1/me": () => ({ body: me }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET /api/v1/ideas/${IDEA_ID}`]: () => ({
      body: { ...idea, archived: options.archived ?? false },
    }),
    [`GET /api/v1/validations/${VALIDATION_ID}/questions/01`]: () => ({
      body: { section: section01, answers: answers01() },
    }),
    [`GET /api/v1/validations/${VALIDATION_ID}/questions/02`]: () => ({
      body: { section: section02, answers: answers02() },
    }),
    ...extra,
  });
}

export const saved =
  (key: string, patch: Partial<ValidationAnswer>, lockVersion: number): Handler =>
  ({ body }) => ({
    body: answer(key, {
      text: (body as { text?: string }).text ?? null,
      lockVersion,
      ...patch,
    }),
  });

export const viewerMe = () =>
  makeMe({
    memberships: [
      {
        workspace: { id: WORKSPACE, name: "BCDX", isPersonal: false, currency: "PHP" },
        role: "viewer",
      },
    ],
  });
