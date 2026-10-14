import type { IdeaSpec } from "../ideas";
import type { PlanSpec } from "../plans";

/**
 * Bacolod Night Market Stall (design-spec 8.2): Proceed, Plan A drafted, then Hold
 * ("Latest decision is Hold" on 20). Strong sales exceed the capacity limit. Only the
 * answers and numbers this needs: no research logs or competitors (8.4).
 */
export const NIGHT_MARKET: IdeaSpec = {
  key: "night-market",
  name: "Bacolod Night Market Stall",
  oneLineConcept:
    "Grilled seafood skewers at the weekend night market on Lacson St.",
  proposedSolution:
    "A rented stall on Friday and Saturday nights selling sets of squid, shrimp and fish skewers at ₱120.",
  proposer: "ana",
  createdDaysAgo: 50,
  template: "v1",
  workedDaysAgo: 40,
  researchLogs: [],
  competitors: [],
  assumptions: [],
  risks: [],
  costs: {
    "initial.equipment": {
      amount: 25000,
      fau: "assumption",
      confidence: "high",
      whyNeeded: "Charcoal grill, tent, cooler",
    },
    "initial.permits": {
      amount: 3000,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.rent": {
      amount: 8000,
      fau: "assumption",
      confidence: "high",
      notes: "Stall fee for eight nights",
    },
    "monthly.salaries": {
      amount: 10000,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.utilities": {
      amount: 1500,
      fau: "assumption",
      confidence: "medium",
    },
    "variable.materials": {
      amount: 55,
      fau: "assumption",
      confidence: "medium",
    },
    "variable.packaging": {
      amount: 5,
      fau: "assumption",
      confidence: "high",
    },
  },
  economics: {
    selling_price: { value: 120, fau: "assumption", confidence: "high" },
    operating_days: {
      value: 8,
      fau: "assumption",
      confidence: "high",
    },
    units_conservative: { value: 60, fau: "assumption", confidence: "medium" },
    units_expected: { value: 90, fau: "assumption", confidence: "medium" },
    units_strong: { value: 140, fau: "assumption", confidence: "low" },
    units_capacity: { value: 120, fau: "assumption", confidence: "high" },
  },
  answers: {
    "V.01.WHO": {
      text: "Families and young workers walking the night market on weekends.",
      fau: "assumption",
      confidence: "high",
    },
    "V.01.PROBLEM": {
      text: "Long queues at the few seafood grills, and skewers that are sold out by 9 p.m.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.01.PAYMENT": {
      text: "Freshly grilled seafood without the queue.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.OCEAN": { text: "Red", fau: "assumption", confidence: "high" },
    "V.02.WHY": {
      text: "Dozens of food stalls compete for the same crowd.",
      fau: "assumption",
      confidence: "high",
    },
  },
};

/** Plan A: drafted after the Proceed and left as the draft made it. */
export const NIGHT_MARKET_PLAN_A: PlanSpec = {
  key: "a",
  name: "Plan A",
  creator: "ana",
  createdDaysAgo: 32,
  editedDaysAgo: 32,
};
