import type { Badge } from "@moonx/ui-web";
import type { TFunction } from "i18next";
import type { ComponentProps } from "react";
import { HOME_KEYS } from "../../lib/validation-home";

export type DecisionValueKey = keyof typeof HOME_KEYS.decision;
type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

const DECISION_BADGE: Partial<Record<DecisionValueKey, BadgeVariant>> = {
  undecided: "undecided",
  proceed: "proceed",
  hold: "hold",
  drop: "drop",
};

/** The Badge color of a decision; a Go / No-Go value has none of its own and stays neutral. */
export const decisionBadge = (value: DecisionValueKey): BadgeVariant =>
  DECISION_BADGE[value] ?? "neutral";

export const decisionText = (t: TFunction, value: DecisionValueKey) => t(HOME_KEYS.decision[value]);
