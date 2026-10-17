import type { CheckDotState } from "../../components/CheckDots";

/** The six checks of a validation, in 6.1's order and words. */
export const checkNames = [
  "Competitors (3–5)",
  "Local price range",
  "Startup & monthly costs",
  "Break-even volume",
  "Permits",
  "Demand or problem signal",
];

/** An idea's six checks for CheckDots, from their states in checkNames' order. */
export const dots = (states: readonly CheckDotState[]) =>
  states.map((state, index) => ({ name: checkNames[index] ?? "", state }));

/** Six checks all in one state. */
export const allChecks = (state: CheckDotState): CheckDotState[] =>
  Array.from({ length: checkNames.length }, () => state);
