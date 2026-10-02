import type { CostRowInput, EconomicsInputValues } from "../src";

type Category = CostRowInput["category"];

const amountRow = (
  category: Category,
  templateKey: string,
  amount: number | null,
  fauState: CostRowInput["fauState"] = "fact",
): CostRowInput => ({
  category,
  templateKey,
  inputMode: "amount",
  amount,
  percent: null,
  fauState,
});

export const percentRow = (templateKey: string, percent: number | null): CostRowInput => ({
  category: "variable",
  templateKey,
  inputMode: "percent_of_price",
  amount: null,
  percent,
  fauState: percent == null ? "empty" : "assumption",
});

export const row = amountRow;

/** design-spec 8.3: Piaya Gift Box Delivery. */
export const piayaRows: CostRowInput[] = [
  amountRow("variable", "variable.materials", 120),
  amountRow("variable", "variable.packaging", 45),
  percentRow("variable.payment_fee", 0.03),
  amountRow("variable", "variable.delivery", 40),
  amountRow("variable", "variable.labor", 0),
  amountRow("variable", "variable.other", 0),
  amountRow("monthly_fixed", "monthly.rent", 12000),
  amountRow("monthly_fixed", "monthly.salaries", 18000),
  amountRow("monthly_fixed", "monthly.utilities", 3500),
  amountRow("monthly_fixed", "monthly.internet", 1200),
  amountRow("monthly_fixed", "monthly.accounting", 2000),
  amountRow("monthly_fixed", "monthly.marketing", 5000),
  amountRow("monthly_fixed", "monthly.insurance", 0),
  amountRow("monthly_fixed", "monthly.other", 0),
  amountRow("initial", "initial.equipment", 35000),
  amountRow("initial", "initial.renovation", 20000),
  amountRow("initial", "initial.lease_deposit", 24000),
  amountRow("initial", "initial.permits", 8500),
  amountRow("initial", "initial.inventory", 15000),
  amountRow("initial", "initial.branding", 12000),
  amountRow("initial", "initial.launch_marketing", 10000),
  amountRow("initial", "initial.tech_setup", 5000),
  amountRow("initial", "initial.working_capital", 40000),
  amountRow("initial", "initial.other", 0),
];

export const piayaInputs: EconomicsInputValues = {
  sellingPrice: 450,
  operatingDays: 26,
  targetMargin: null,
  unitsConservative: 6,
  unitsExpected: 10,
  unitsStrong: 15,
  unitsCapacity: 25,
};
