import type { EconomicsField, LinkTarget, TargetRef } from "@moonx/schemas";

/** Where an item lives: its workspace, and the idea, plan or self-analysis it is in. */
export interface ItemPlace {
  workspaceId: string;
  ideaId: string | null;
  planId: string | null;
  /** The owner of a self-analysis, whose screens differ from everyone else's. */
  selfAnalysisOwnerId: string | null;
}

const questionSection = (key: string | null | undefined) =>
  key?.split(".")[1] ?? "";

/**
 * The screen that shows `target`, focused on it (SDD 6.3「画面と節の対応」, 4章), as
 * `viewerId` opens it: a self-analysis answer is 11 for its owner and 12, the member's
 * self-analysis, for anyone else. A template version opens the hub of what it pins.
 */
export function itemLink(
  target: TargetRef,
  place: ItemPlace,
  viewerId: string,
): LinkTarget {
  const base = { workspaceId: place.workspaceId };
  const idea = place.ideaId === null ? {} : { ideaId: place.ideaId };
  const plan = {
    ...idea,
    ...(place.planId === null ? {} : { planId: place.planId }),
  };
  const rowId = target.id;
  const questionKey = target.key ?? undefined;
  switch (target.type) {
    case "idea":
      return { screen: 13, ...base, ...idea };
    case "validation_answer": {
      const section = questionSection(target.key);
      if (section === "04")
        return { screen: 15, ...base, ...idea, questionKey };
      if (section === "08")
        return { screen: 18, ...base, ...idea, questionKey };
      return { screen: 11, ...base, ...idea, sectionKey: section, questionKey };
    }
    case "research_log_entry":
      return { screen: 14, ...base, ...idea, rowId };
    case "competitor":
      return { screen: 15, ...base, ...idea, rowId };
    case "assumption":
      return { screen: 16, ...base, ...idea, tab: "assumptions", rowId };
    case "risk":
      return { screen: 16, ...base, ...idea, tab: "risks", rowId };
    case "cost_item":
      return { screen: 17, ...base, ...idea, rowId };
    case "economics_input":
      return {
        screen: 18,
        ...base,
        ...idea,
        field: (target.key ?? undefined) as EconomicsField | undefined,
      };
    case "plan_answer":
      return {
        screen: 21,
        ...base,
        ...plan,
        itemNo: Number(questionSection(target.key)),
        questionKey,
      };
    case "execution_item":
      return { screen: 22, ...base, ...plan, rowId };
    case "pitch_slide":
      return { screen: 23, ...base, ...plan };
    case "business_plan":
      return { screen: 20, ...base, ...plan };
    case "template_version":
      if (place.planId !== null) return { screen: 20, ...base, ...plan };
      if (place.ideaId !== null) return { screen: 13, ...base, ...idea };
      return { screen: 10, ...base };
    case "self_analysis_answer": {
      const focus = { sectionKey: questionSection(target.key), questionKey };
      return viewerId === place.selfAnalysisOwnerId
        ? { screen: 11, ...base, ...focus }
        : {
            screen: 12,
            ...base,
            userId: place.selfAnalysisOwnerId ?? undefined,
            ...focus,
          };
    }
  }
}
