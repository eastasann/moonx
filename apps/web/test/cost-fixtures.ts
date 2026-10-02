import type {
  Classification,
  CostCategory,
  CostItem,
  EconomicsField,
  EconomicsInput,
  FauState,
} from "@moonx/schemas";
import { answer, emptyClassification } from "./question-fixtures";

const STATE_FAU: Partial<Record<FauState, Classification["fau"]>> = {
  fact: "fact",
  assumption: "assumption",
  unknown: "unknown",
};

export function classification(state: FauState): Classification {
  return {
    ...emptyClassification(),
    state,
    fau: STATE_FAU[state] ?? null,
    confidence: state === "assumption" ? "medium" : null,
    evidence:
      state === "fact"
        ? [{ id: "e1", kind: "url", researchLog: null, url: "https://example.com", note: null }]
        : [],
  };
}

interface RowSpec {
  category: CostCategory;
  key: string;
  name: string;
  amount?: number | null;
  percent?: number | null;
  state?: FauState;
}

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

export function costItem(spec: RowSpec, sortOrder: number): CostItem {
  const percent = spec.percent ?? null;
  const amount = percent === null ? (spec.amount ?? null) : null;
  const hasValue = percent !== null || amount !== null;
  return {
    id: uuid(),
    category: spec.category,
    templateKey: spec.key,
    name: spec.name,
    inputMode: percent === null ? "amount" : "percent_of_price",
    amount,
    percent,
    isLumpSum: false,
    whyNeeded: null,
    canReduce: null,
    notes: null,
    classification: classification(spec.state ?? (hasValue ? "fact" : "empty")),
    sortOrder,
    commentCount: 0,
    lockVersion: 1,
    updatedAt: null,
    updatedBy: null,
  };
}

/** design-spec 8.3: the Piaya Gift Box Delivery cost rows. */
export const PIAYA_ROWS: RowSpec[] = [
  { category: "initial", key: "initial.equipment", name: "Equipment", amount: 35000 },
  { category: "initial", key: "initial.renovation", name: "Renovation", amount: 20000 },
  { category: "initial", key: "initial.lease_deposit", name: "Lease Deposit", amount: 24000 },
  { category: "initial", key: "initial.permits", name: "Permits", amount: 8500 },
  { category: "initial", key: "initial.inventory", name: "Initial Inventory", amount: 15000 },
  { category: "initial", key: "initial.branding", name: "Branding", amount: 12000 },
  { category: "initial", key: "initial.launch_marketing", name: "Launch Marketing", amount: 10000 },
  { category: "initial", key: "initial.tech_setup", name: "Tech Setup", amount: 5000 },
  {
    category: "initial",
    key: "initial.working_capital",
    name: "Working Capital Buffer",
    amount: 40000,
  },
  { category: "initial", key: "initial.other", name: "Other", amount: 0 },
  { category: "monthly_fixed", key: "monthly.rent", name: "Rent", amount: 12000 },
  { category: "monthly_fixed", key: "monthly.salaries", name: "Salaries", amount: 18000 },
  { category: "monthly_fixed", key: "monthly.utilities", name: "Utilities", amount: 3500 },
  { category: "monthly_fixed", key: "monthly.internet", name: "Internet-Software", amount: 1200 },
  { category: "monthly_fixed", key: "monthly.accounting", name: "Accounting", amount: 2000 },
  { category: "monthly_fixed", key: "monthly.marketing", name: "Base Marketing", amount: 5000 },
  { category: "monthly_fixed", key: "monthly.insurance", name: "Insurance-Compliance", amount: 0 },
  { category: "monthly_fixed", key: "monthly.other", name: "Other", amount: 0 },
  { category: "variable", key: "variable.materials", name: "Materials", amount: 120 },
  { category: "variable", key: "variable.packaging", name: "Packaging", amount: 45 },
  { category: "variable", key: "variable.payment_fee", name: "Payment Fee", percent: 0.03 },
  { category: "variable", key: "variable.delivery", name: "Delivery", amount: 40 },
  { category: "variable", key: "variable.labor", name: "Variable Labor", amount: 0 },
  { category: "variable", key: "variable.other", name: "Other", amount: 0 },
];

export const costItems = (rows: RowSpec[]): CostItem[] => rows.map(costItem);

/** The seven inputs; `null` leaves one empty. design-spec 8.3 has the target margin empty. */
export type EconomicsValues = Partial<Record<EconomicsField, number | null>>;

export const PIAYA_INPUTS: EconomicsValues = {
  selling_price: 450,
  operating_days: 26,
  target_margin: null,
  units_conservative: 6,
  units_expected: 10,
  units_strong: 15,
  units_capacity: 25,
};

const FIELDS: EconomicsField[] = [
  "selling_price",
  "operating_days",
  "target_margin",
  "units_conservative",
  "units_expected",
  "units_strong",
  "units_capacity",
];

export function economicsInputs(values: EconomicsValues): EconomicsInput[] {
  return FIELDS.map((fieldKey) => {
    const value = values[fieldKey] ?? null;
    return {
      fieldKey,
      value,
      classification: classification(value === null ? "empty" : "assumption"),
      commentCount: 0,
      lockVersion: value === null ? 0 : 1,
      updatedAt: null,
      updatedBy: null,
    };
  });
}

export const worthAnswer = () => answer("V.08.WORTH");
