import type { CheckVariant } from "@moonx/ui-tokens";
import { dot, dots } from "./CheckDots.css";

const GLYPH: Record<CheckVariant, string> = { done: "●", partial: "◐", "not-started": "○" };

export interface CheckDotsItem {
  /** Name of the check, for the accessible description. */
  label: string;
  state: CheckVariant;
  /** Text of the state ("Done", "Partial", "Not started"), for the accessible description. */
  stateLabel: string;
}

export interface CheckDotsProps {
  /** One dot per item, in the given order. */
  items: CheckDotsItem[];
  size?: "S" | "M";
}

/**
 * The states of the six checks as a row of dots, ● done, ◐ partial, ○ not started (design-spec
 * 6.8). The shape carries the state, so color is never the only signal; assistive technology
 * reads one image named by every check and its state.
 */
export function CheckDots({ items, size = "M" }: CheckDotsProps) {
  const description = items.map((item) => `${item.label}: ${item.stateLabel}`).join(", ");
  return (
    <span role="img" aria-label={description} className={dots({ size })}>
      {items.map((item) => (
        <span key={item.label} aria-hidden="true" className={dot({ state: item.state })}>
          {GLYPH[item.state]}
        </span>
      ))}
    </span>
  );
}
