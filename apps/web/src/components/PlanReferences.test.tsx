import { formatDate } from "@moonx/i18n";
import type { DecisionLogSummary, PlanReference } from "@moonx/schemas";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { ana } from "../test/api";
import { workspaceId } from "../test/ideas";
import { anaRef, ideaId } from "../test/plans";
import { PlanReferences } from "./PlanReferences";
import { WorkspaceContext } from "./workspace";

// The references of 21 that PlanItem.test.tsx does not open (design-spec 6.12「参照」):
// the decisions, the shared self-analyses, the numbers, the assumptions and risks.

const workspace = {
  id: workspaceId,
  name: "BCDX",
  isPersonal: false,
  currency: "PHP",
};

const paoloRef = {
  id: "6fa459ea-ee8a-4ca4-894e-db77e160355e",
  displayName: "Paolo Gonzaga",
  avatarUrl: null,
  badge: null,
};

const entry = (
  id: string,
  extra: Partial<DecisionLogSummary>,
): DecisionLogSummary => ({
  id,
  kind: "validation_decision",
  value: "proceed",
  versionName: null,
  idea: { id: ideaId, name: "Piaya Gift Box Delivery" },
  plan: null,
  reasonExcerpt: null,
  recordedBy: anaRef,
  recordedAt: "2026-10-10T01:00:00.000Z",
  ...extra,
});

const decisions: PlanReference = {
  kind: "decision_log",
  title: "Decision Log",
  data: [
    entry("9b2c1e5a-0000-4000-8000-000000000001", {
      reasonExcerpt: "All six checks are done.",
    }),
    entry("9b2c1e5a-0000-4000-8000-000000000002", {
      kind: "version_saved",
      value: null,
      versionName: "v1 For advisors",
    }),
  ],
  link: { screen: 7, workspaceId, ideaId },
};

const goNoGo: PlanReference = {
  kind: "go_no_go_history",
  title: "Go / No-Go history",
  data: [
    entry("9b2c1e5a-0000-4000-8000-000000000003", {
      kind: "go_no_go",
      value: "delay",
      versionName: "v1 For advisors",
    }),
  ],
  link: { screen: 7, workspaceId, ideaId },
};

const selfAnalyses: PlanReference = {
  kind: "self_analysis",
  title: "Self analyses",
  data: [
    {
      selfAnalysisId: "1c6f0000-0000-4000-8000-000000000001",
      user: anaRef,
      currency: "PHP",
      sections: [
        {
          key: "02",
          part: null,
          title: "02 Skills",
          subtitle: null,
          guidance: null,
          answers: [
            {
              questionKey: "S.02.SKILLS",
              title: "Skills",
              text: "Baking",
              amount: null,
            },
            {
              questionKey: "S.02.FUNDS",
              title: "Funds",
              text: null,
              amount: 50000.5,
            },
            {
              questionKey: "S.02.HOURS",
              title: "Hours",
              text: null,
              amount: null,
            },
          ],
        },
      ],
    },
    {
      selfAnalysisId: "1c6f0000-0000-4000-8000-000000000002",
      user: paoloRef,
      currency: "PHP",
      sections: [
        {
          key: "02",
          part: null,
          title: "02 Skills",
          subtitle: null,
          guidance: null,
          answers: [
            {
              questionKey: "S.02.SKILLS",
              title: "Skills",
              text: "Repairs",
              amount: null,
            },
          ],
        },
      ],
    },
  ],
  link: null,
};

const numbers: PlanReference = {
  kind: "metrics",
  title: "Unit Economics",
  data: [
    {
      key: "initial_cost_total",
      value: { value: 169500, bound: "exact", reason: null },
    },
  ],
  link: { screen: 18, workspaceId, ideaId },
};

const assumptions: PlanReference = {
  kind: "assumptions",
  title: "Assumptions",
  data: [
    {
      id: "a5500000-0000-4000-8000-000000000001",
      statement: "Offices order gift boxes for holidays",
      whyBelieve: "Three HR heads said so",
      evidence: null,
      confidence: "medium",
      disproveCondition: null,
    },
  ],
  link: { screen: 16, workspaceId, ideaId },
};

const risks: PlanReference = {
  kind: "risks",
  title: "Risks",
  data: [
    {
      id: "a5500000-0000-4000-8000-000000000002",
      statement: "Piaya goes stale in transit",
      probability: "low",
      impact: "high",
      mitigation: null,
    },
  ],
  link: { screen: 16, workspaceId, ideaId },
};

const research: PlanReference = {
  kind: "research_log",
  title: "Research Log",
  data: [
    {
      id: "4e5e0000-0000-4000-8000-000000000001",
      observedOn: null,
      topic: "Office gift budgets",
      observation: null,
      sourceType: null,
      sourceUrl: null,
    },
  ],
  link: null,
};

const renderReferences = (references: PlanReference[]) =>
  render(
    <WorkspaceContext.Provider value={{ me: ana, workspace, role: "owner" }}>
      <PlanReferences references={references} />
    </WorkspaceContext.Provider>,
  );

const open = async (title: string) => {
  await userEvent.click(screen.getByRole("button", { name: title }));
  const button = screen.getByRole("button", { name: title });
  const panel = document.getElementById(
    button.getAttribute("aria-controls") ?? "",
  );
  if (panel === null) throw new Error(`${title} has no panel`);
  return within(panel);
};

describe("21's references (design-spec 6.12)", () => {
  test("the decisions: what was decided, when and by whom, why; they open 7, Go / No-Go on its kind", async () => {
    renderReferences([decisions, goNoGo]);
    const log = await open("Decision Log");
    expect(log.getByText("Decision: Proceed")).toBeTruthy();
    expect(log.getByText("All six checks are done.")).toBeTruthy();
    expect(log.getByText("Version saved: v1 For advisors")).toBeTruthy();
    expect(log.getAllByText(/Ana Villanueva/).length).toBe(2);
    expect(
      log.getAllByText(
        formatDate("2026-10-10T01:00:00.000Z", { timeZone: ana.timezone }),
        { exact: false },
      ).length,
    ).toBe(2);
    expect(
      log.getByRole("link", { name: "Open Decision Log" }).getAttribute("href"),
    ).toBe(`/w/${workspaceId}/decisions?idea=${ideaId}`);

    const history = await open("Go / No-Go history");
    expect(history.getByText("Go / No-Go: Delay")).toBeTruthy();
    expect(
      history
        .getByRole("link", { name: "Open Decision Log" })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/decisions?kind=go_no_go&idea=${ideaId}`);
  });

  test("the shared self-analyses: the first member's answers, another's when chosen; no link", async () => {
    const user = userEvent.setup();
    renderReferences([selfAnalyses]);
    const shared = await open("Self analyses");
    expect(shared.getByText("02 Skills")).toBeTruthy();
    expect(shared.getByText("Baking")).toBeTruthy();
    // An amount in the workspace's currency with its cents; a blank answer is Empty.
    expect(shared.getByText("₱50,000.50")).toBeTruthy();
    expect(shared.getByText("Empty")).toBeTruthy();
    expect(shared.queryByRole("link")).toBeNull();

    await user.click(shared.getByRole("button", { name: /Member/ }));
    await user.click(
      await screen.findByRole("option", { name: "Paolo Gonzaga" }),
    );
    expect(shared.getByText("Repairs")).toBeTruthy();
    expect(shared.queryByText("Baking")).toBeNull();
  });

  test("numbers, assumptions and risks: each field that has a value", async () => {
    renderReferences([numbers, assumptions, risks, research]);
    const unit = await open("Unit Economics");
    expect(unit.getByText("Startup cost")).toBeTruthy();
    expect(unit.getByText("₱169,500")).toBeTruthy();
    expect(
      unit
        .getByRole("link", { name: "Open in validation" })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${ideaId}/economics`);

    const believed = await open("Assumptions");
    expect(
      believed.getByText("Offices order gift boxes for holidays"),
    ).toBeTruthy();
    expect(
      believed.getByText("Why We Believe It: Three HR heads said so"),
    ).toBeTruthy();
    expect(believed.getByText("Confidence: Medium")).toBeTruthy();
    expect(believed.queryByText(/What Would Disprove It/)).toBeNull();

    const feared = await open("Risks");
    expect(feared.getByText("Probability: Low")).toBeTruthy();
    expect(feared.getByText("Impact: High")).toBeTruthy();
    expect(feared.queryByText(/Mitigation/)).toBeNull();

    // A research log without a date goes by its topic; one without an observation is Empty.
    const logs = await open("Research Log");
    expect(logs.getByText("Office gift budgets")).toBeTruthy();
    expect(logs.getByText("Empty")).toBeTruthy();
  });

  test("§13's totals are left out, and an item with none shows nothing", () => {
    const { container } = renderReferences([
      {
        kind: "totals",
        title: "Totals",
        data: { ownership: 1, capital: 0 },
        link: null,
      },
    ]);
    expect(container.textContent).toBe("");
  });
});
