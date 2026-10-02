import type { CostItem, EconomicsInput } from "@moonx/schemas";
import {
  costItems,
  type EconomicsValues,
  economicsInputs,
  PIAYA_INPUTS,
  PIAYA_ROWS,
  worthAnswer,
} from "./cost-fixtures";
import { IDEA_ID, idea, VALIDATION_ID } from "./question-fixtures";
import { type Handler, makeMe, stubApi, WORKSPACE } from "./support";

export { registerQuestionFormHooks as registerCostHooks } from "./support-questions";

export const COSTS_PATH = (search = "") => `/w/${WORKSPACE}/ideas/${IDEA_ID}/costs${search}`;
export const ECONOMICS_PATH = (search = "") =>
  `/w/${WORKSPACE}/ideas/${IDEA_ID}/economics${search}`;
const V = `/api/v1/validations/${VALIDATION_ID}`;
export const COST_ITEM = (id: string) => `PATCH /api/v1/cost-items/${id}`;
export const ECONOMICS_FIELD = (field: string) => `PUT ${V}/economics/${field}`;

export interface CostsApiOptions {
  rows?: Parameters<typeof costItems>[0];
  /** Rows built beforehand, for a test whose handlers are keyed by a row's id. */
  items?: CostItem[];
  inputs?: EconomicsValues;
  me?: ReturnType<typeof makeMe>;
  archived?: boolean;
}

/** The stub of every request the cost and economics screens make, with Piaya's numbers by default. */
export function costsApi(extra: Record<string, Handler> = {}, options: CostsApiOptions = {}) {
  const items: CostItem[] = options.items ?? costItems(options.rows ?? PIAYA_ROWS);
  const inputs: EconomicsInput[] = economicsInputs(options.inputs ?? PIAYA_INPUTS);
  const stub = stubApi({
    "GET /api/v1/me": () => ({ body: options.me ?? makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET /api/v1/ideas/${IDEA_ID}`]: () => ({
      body: { ...idea, archived: options.archived ?? false },
    }),
    [`GET ${V}/costs`]: () => ({ body: { items, result: {}, economicsInputs: inputs } }),
    [`GET ${V}/economics`]: () => ({
      body: { inputs, worth: worthAnswer(), result: {}, costItems: items },
    }),
    ...extra,
  });
  return { ...stub, items, inputs };
}

/** Answers a V14 PATCH with the row as it would be after the change, one version on. */
export const patchOk =
  (item: CostItem, patch: Partial<CostItem> = {}): Handler =>
  ({ body }) => {
    const { lockVersion: _lock, force: _force, ...fields } = body as Record<string, unknown>;
    return { body: { ...item, ...fields, ...patch, lockVersion: item.lockVersion + 1 } };
  };

export const rowNamed = (items: CostItem[], name: string, category?: CostItem["category"]) => {
  const found = items.find((i) => i.name === name && (!category || i.category === category));
  if (!found) throw new Error(`no row ${name}`);
  return found;
};
