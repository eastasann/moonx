import { afterAll, describe, expect, test } from "bun:test";
import {
  competitors,
  costItems,
  economicsInputs,
  executionItems,
  researchLogEntries,
} from "@moonx/db";
import type { TargetRef } from "@moonx/schemas";
import { loadItemLabels } from "./labels";
import { connectTestDatabase } from "./test-app";
import { testFixtures } from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);

describe("loadItemLabels (SDD 5.11 HistoryEntry label)", () => {
  test("names questions by section and title, rows by list and text, ideas and plans by name", async () => {
    const team = await fixtures.createTeam();
    const { idea, validation } = await fixtures.createIdea(
      team.workspace.id,
      team.owner.id,
      { name: "Piaya boxes" },
    );
    const plan = await fixtures.createPlan(idea.id, team.owner.id, {
      name: "Plan A",
    });
    const [rent, unnamed] = await db
      .insert(costItems)
      .values([
        {
          validationId: validation.id,
          category: "monthly_fixed",
          name: "Rent",
          sortOrder: 0,
        },
        {
          validationId: validation.id,
          category: "monthly_fixed",
          name: "  ",
          sortOrder: 1,
          deletedAt: new Date(),
        },
      ])
      .returning();
    const long = "A statement ".repeat(10).trim();
    const [rival] = await db
      .insert(competitors)
      .values({ validationId: validation.id, name: long, sortOrder: 0 })
      .returning();
    const [log] = await db
      .insert(researchLogEntries)
      .values({
        validationId: validation.id,
        topic: "Price check",
        createdById: team.owner.id,
      })
      .returning();
    const [item] = await db
      .insert(executionItems)
      .values({
        businessPlanId: plan.id,
        type: "milestone",
        title: "Open the stall",
        sortOrder: 0,
      })
      .returning();
    await db.insert(economicsInputs).values({
      validationId: validation.id,
      fieldKey: "selling_price",
      value: 450,
    });
    const targets: [TargetRef, string][] = [
      [
        { type: "validation_answer", id: validation.id, key: "V.01.WHO" },
        "01 WHO",
      ],
      [
        { type: "validation_answer", id: validation.id, key: "V.01.RETIRED" },
        "01 RETIRED",
      ],
      [
        { type: "economics_input", id: validation.id, key: "selling_price" },
        "Unit Economics · Price",
      ],
      [{ type: "cost_item", id: rent?.id ?? "" }, "Costs · Rent"],
      [{ type: "cost_item", id: unnamed?.id ?? "" }, "Costs · Untitled"],
      [
        { type: "competitor", id: rival?.id ?? "" },
        `Competitors · ${long.slice(0, 79)}…`,
      ],
      [
        { type: "research_log_entry", id: log?.id ?? "" },
        "Research Log · Price check",
      ],
      [
        { type: "execution_item", id: item?.id ?? "" },
        "Execution · Open the stall",
      ],
      [{ type: "idea", id: idea.id }, "Piaya boxes"],
      [{ type: "business_plan", id: plan.id }, "Plan A"],
      [
        { type: "template_version", id: validation.id, key: "validation" },
        "Template version",
      ],
      [{ type: "pitch_slide", id: plan.id, key: "five.market" }, "Pitch Deck"],
    ];
    const label = await loadItemLabels(
      db,
      targets.map(([target]) => target),
    );
    expect(targets.map(([target]) => label(target))).toEqual(
      targets.map(([, expected]) => expected),
    );
    expect(label({ type: "competitor", id: rival?.id ?? "" }).length).toBe(
      80 + "Competitors · ".length,
    );
  });
});
