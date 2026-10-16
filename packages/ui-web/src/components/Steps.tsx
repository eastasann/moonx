import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { VisuallyHidden } from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./Steps.css";

export interface StepsProps {
  /** The steps in order ("Paste", "Sort", "Review", "Apply"). */
  steps: readonly { id: string; label: ReactNode }[];
  /** The step on screen; the ones before it are done. */
  currentId: string;
  /**
   * Read after a done step's name ("completed"), since its check mark is not read
   * (design-spec 4.5).
   */
  doneLabel: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * Where a fixed procedure stands, 1 → 2 → 3 (pattern G, design-spec 4.1・4.5): the steps
 * done carry a check, the current one is marked for screen readers as the current step.
 */
export function Steps({ steps, currentId, doneLabel, ...props }: StepsProps) {
  const current = steps.findIndex((step) => step.id === currentId);
  if (current === -1) {
    throw new Error(`Steps: no step "${currentId}"`);
  }
  return (
    <ol {...props} className={styles.steps}>
      {steps.map((step, index) => {
        const state =
          index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className={`${styles.step} ${styles.stepState[state]}`}
          >
            <span aria-hidden="true" className={styles.marker[state]}>
              {state === "done" ? (
                <IconSlot size="XS">
                  <Check />
                </IconSlot>
              ) : (
                index + 1
              )}
            </span>
            <span className={styles.label}>
              {step.label}
              {state === "done" && (
                <VisuallyHidden>{` ${doneLabel}`}</VisuallyHidden>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
