import type { TFunction } from "i18next";
import type { IdeaSummary } from "../../lib/ideas";
import { checkLabel } from "../../lib/validation-home";

type CheckState = IdeaSummary["checks"][number]["state"];

/** `done` / `partial` / `not_started` as the `CheckDots` and `StatusLight` variants name them. */
export const checkVariant = (state: CheckState) =>
  state === "not_started" ? ("not-started" as const) : state;

/** The proposer's name; a deleted account has no name left to show. */
export function proposerName(t: TFunction, proposer: IdeaSummary["proposer"]): string {
  if (proposer.badge === "deleted") return t("common:deletedUser");
  if (proposer.badge === "former_member") {
    return t("ideas:row.formerMember", { name: proposer.displayName });
  }
  return proposer.displayName;
}

/** The names of the checks that are not done yet, in the order of the six. */
export function missingChecks(t: TFunction, idea: IdeaSummary): string[] {
  return idea.checks.filter((c) => c.state !== "done").map((check) => checkLabel(t, check));
}
