import { uid } from "../lib/ids";
import type { World } from "../lib/rows";
import type { Clock } from "../lib/time";
import { templateVersionId } from "../templates/load";
import { selfAnalysisTemplate } from "../templates/self-analysis";
import { versionOf } from "../templates/types";
import { BCDX, type PersonKey, userId } from "./ids";

export const selfAnalysisId = (key: PersonKey) => uid("self-analysis", key);

const AMOUNTS: Partial<Record<PersonKey, [number, number, number]>> = {
  ana: [80000, 150000, 250000],
  kenji: [70000, 130000, 220000],
  paolo: [60000, 120000, 200000],
};

/**
 * Self analyses (design-spec 8.1): Ana and Paolo done and shared with BCDX, Kenji at 21 of 36,
 * Grace not started. Answers reuse the template's EXAMPLE text, since the demo people are fictional.
 */
export function addSelfAnalyses(world: World, clock: Clock) {
  const questions = versionOf(selfAnalysisTemplate, 1).sections.flatMap((s) => s.questions);
  const plan: {
    key: PersonKey;
    status: "done" | "in_progress" | "not_started";
    answered: number;
  }[] = [
    { key: "ana", status: "done", answered: 36 },
    { key: "kenji", status: "in_progress", answered: 21 },
    { key: "paolo", status: "done", answered: 36 },
    { key: "grace", status: "not_started", answered: 0 },
  ];

  for (const { key, status, answered } of plan) {
    const id = selfAnalysisId(key);
    const started = clock.ago(60);
    world.selfAnalyses.push({
      id,
      userId: userId(key),
      templateVersionId: templateVersionId("self_analysis", 1),
      currency: "PHP",
      status,
      completedAt: status === "done" ? clock.ago(key === "ana" ? 40 : 35) : null,
      createdAt: started,
      updatedAt: clock.ago(key === "kenji" ? 3 : 35),
    });

    questions.slice(0, answered).forEach((q, index) => {
      const income = q.key.startsWith("SA.INCOME.");
      const incomeIndex = income ? Number(q.key.split(".")[2]) - 1 : -1;
      const example = q.example ?? "";
      const reason = example.replace(/^PHP [\d,]+\+?(?:\/month(?: after tax)?)?\.\s*/, "");
      world.selfAnalysisAnswers.push({
        id: uid("sa-answer", key, q.key),
        selfAnalysisId: id,
        questionKey: q.key,
        text: income ? reason : example,
        amount: income ? (AMOUNTS[key]?.[incomeIndex] ?? null) : null,
        updatedById: userId(key),
        createdAt: clock.ago(60 - index),
        updatedAt: clock.ago(60 - index),
      });
    });
  }

  for (const key of ["ana", "paolo"] as const) {
    world.selfAnalysisShares.push({
      id: uid("sa-share", key),
      selfAnalysisId: selfAnalysisId(key),
      workspaceId: BCDX,
      sharedAt: clock.ago(key === "ana" ? 39 : 34),
      createdAt: clock.ago(key === "ana" ? 39 : 34),
      updatedAt: clock.ago(key === "ana" ? 39 : 34),
    });
  }
}
