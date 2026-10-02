import { Check } from "lucide-react";
import { list, marker, step } from "./Steps.css";

export interface StepItem {
  id: string;
  label: string;
}

export interface StepsProps {
  /** Name of the step indicator. */
  "aria-label": string;
  items: readonly StepItem[];
  /** `id` of the step being shown. Steps before it count as done. */
  current: string;
}

/** The 1 → 2 → 3 indicator of a fixed sequence of steps (layout pattern G). */
export function Steps({ items, current, ...props }: StepsProps) {
  const currentIndex = items.findIndex((item) => item.id === current);
  return (
    <nav aria-label={props["aria-label"]}>
      <ol className={list}>
        {items.map((item, index) => {
          const status =
            index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
          return (
            <li
              key={item.id}
              data-status={status}
              aria-current={status === "current" ? "step" : undefined}
              className={step}
            >
              <span className={marker} aria-hidden="true">
                {status === "done" ? <Check size={14} /> : index + 1}
              </span>
              {item.label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
