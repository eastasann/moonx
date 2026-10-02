import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { type IdeaKey, ideaId } from "@moonx/db/seed";
import {
  createEvidenceResponseSchema,
  type ValidationAnswer,
  validationAnswerSchema,
} from "@moonx/schemas";
import { and, asc, eq, isNull } from "drizzle-orm";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let ana: Record<string, string>;
let kenji: Record<string, string>;
let grace: Record<string, string>;
let admin: Record<string, string>;

beforeAll(async () => {
  t = await startTestApp();
  ana = await login(t.app, "ana");
  kenji = await login(t.app, "kenji");
  grace = await login(t.app, "grace");
  admin = await login(t.app, "admin");
});
afterAll(async () => {
  await t.close();
});

async function validationOf(key: IdeaKey) {
  const [row] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, ideaId(key)));
  return (row as { id: string }).id;
}

const questionsPath = (validationId: string, section: string) =>
  `/api/v1/validations/${validationId}/questions/${section}`;
const answerPath = (validationId: string, key: string) =>
  `/api/v1/validations/${validationId}/answers/${key}`;
const evidencePath = (validationId: string) => `/api/v1/validations/${validationId}/evidence`;

const historyOf = (targetId: string, targetKey?: string) =>
  t.db
    .select()
    .from(schema.changeHistory)
    .where(
      and(
        eq(schema.changeHistory.targetId, targetId),
        targetKey ? eq(schema.changeHistory.targetKey, targetKey) : undefined,
      ),
    )
    .orderBy(asc(schema.changeHistory.changedAt));

const put = (
  validationId: string,
  key: string,
  body: Record<string, unknown>,
  as: Record<string, string> = ana,
) => call(t.app, "PUT", answerPath(validationId, key), { as, body });

describe("V2 question sections", () => {
  test("returns the pinned template's section with exactly one answer per question", async () => {
    const piaya = await validationOf("piaya");
    const res = await call(t.app, "GET", questionsPath(piaya, "01"), { as: ana });
    expect(res.status).toBe(200);
    expect(res.body.section.key).toBe("01");
    expect(res.body.section.title).toBe("Customer & Problem");
    expect(res.body.section.questions).toHaveLength(10);
    expect(res.body.section.questions[0]).toMatchObject({
      key: "V.01.WHO",
      sectionKey: "01",
      answerType: "long_text",
      hasFau: true,
    });
    expect(res.body.answers.map((a: ValidationAnswer) => a.questionKey)).toEqual(
      res.body.section.questions.map((q: { key: string }) => q.key),
    );
    for (const answer of res.body.answers) validationAnswerSchema.parse(answer);
    const fact = res.body.answers.find((a: ValidationAnswer) => a.classification.state === "fact");
    expect(fact.text).toBeString();
    expect(fact.classification.evidence.length).toBeGreaterThan(0);
    expect(fact.classification.evidence[0]).toMatchObject({
      id: expect.any(String),
      kind: expect.stringMatching(/research_log|url/),
    });
  });

  test("unanswered questions come back with text null and lockVersion 0; v2 adds a question", async () => {
    const bike = await validationOf("bike-repair");
    const res = await call(t.app, "GET", questionsPath(bike, "01"), { as: ana });
    expect(res.body.section.questions).toHaveLength(11);
    const byKey = Object.fromEntries(
      res.body.answers.map((a: ValidationAnswer) => [a.questionKey, a]),
    );
    expect(byKey["V.01.WHY_THEM"]).toMatchObject({
      text: null,
      lockVersion: 0,
      updatedAt: null,
      updatedBy: null,
      hidden: false,
      commentCount: 0,
      classification: { fau: null, confidence: null, state: "empty", evidence: [] },
    });
    expect(byKey["V.01.WHO"].classification).toMatchObject({
      fau: "assumption",
      confidence: "low",
      state: "assumption",
    });
    expect(byKey["V.01.PROBLEM"].classification.state).toBe("unclassified");
    expect(byKey["V.01.REACH"]).toBeDefined();
  });

  test("hidden follows the OCEAN answer: all market questions are returned", async () => {
    const bike = await validationOf("bike-repair");
    const unanswered = await call(t.app, "GET", questionsPath(bike, "02"), { as: ana });
    expect(unanswered.body.answers).toHaveLength(15);
    const hiddenKeys = unanswered.body.answers
      .filter((a: ValidationAnswer) => a.hidden)
      .map((a: ValidationAnswer) => a.questionKey);
    expect(hiddenKeys).toHaveLength(7);
    expect(hiddenKeys.every((k: string) => /\.(RED|BLUE)_\d$/.test(k))).toBe(true);

    expect((await put(bike, "V.02.OCEAN", { text: "Red", lockVersion: 0 })).status).toBe(200);
    const red = await call(t.app, "GET", questionsPath(bike, "02"), { as: ana });
    const hidden = red.body.answers
      .filter((a: ValidationAnswer) => a.hidden)
      .map((a: ValidationAnswer) => a.questionKey);
    expect(hidden.sort()).toEqual(["V.02.BLUE_1", "V.02.BLUE_2", "V.02.BLUE_3"]);
  });

  test("commentCount counts comments and replies, not deleted ones", async () => {
    const [comment] = await t.db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.targetType, "validation_answer"));
    if (!comment) throw new Error("the demo data has no comment on an answer");
    const rows = await t.db
      .select()
      .from(schema.comments)
      .where(
        and(
          eq(schema.comments.targetType, "validation_answer"),
          eq(schema.comments.targetId, comment.targetId),
          eq(schema.comments.targetKey, comment.targetKey as string),
          isNull(schema.comments.deletedAt),
        ),
      );
    const [validation] = await t.db
      .select({ ideaId: schema.validations.ideaId })
      .from(schema.validations)
      .where(eq(schema.validations.id, comment.targetId));
    expect(validation).toBeDefined();
    const section = (comment.targetKey as string).split(".")[1] as string;
    const res = await call(t.app, "GET", questionsPath(comment.targetId, section), { as: ana });
    const answer = res.body.answers.find(
      (a: ValidationAnswer) => a.questionKey === comment.targetKey,
    );
    expect(answer.commentCount).toBe(rows.length);
    expect(answer.commentCount).toBeGreaterThan(0);

    await t.db.insert(schema.comments).values({
      workspaceId: comment.workspaceId,
      targetType: "validation_answer",
      targetId: comment.targetId,
      targetKey: comment.targetKey,
      parentId: comment.parentId ?? comment.id,
      authorId: comment.authorId,
      body: "reply",
    });
    const again = await call(t.app, "GET", questionsPath(comment.targetId, section), { as: ana });
    expect(
      again.body.answers.find((a: ValidationAnswer) => a.questionKey === comment.targetKey)
        .commentCount,
    ).toBe(rows.length + 1);
    await t.db
      .update(schema.comments)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.comments.body, "reply")));
    const third = await call(t.app, "GET", questionsPath(comment.targetId, section), { as: ana });
    expect(
      third.body.answers.find((a: ValidationAnswer) => a.questionKey === comment.targetKey)
        .commentCount,
    ).toBe(rows.length);
  });

  test("sections 04 and 08 and unknown keys are 404; a Viewer reads; outsiders are 403", async () => {
    const piaya = await validationOf("piaya");
    for (const section of ["04", "08", "03", "99"]) {
      const res = await call(t.app, "GET", questionsPath(piaya, section), { as: ana });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    }
    expect((await call(t.app, "GET", questionsPath(piaya, "10"), { as: grace })).status).toBe(200);
    const outsider = await call(t.app, "GET", questionsPath(piaya, "01"), { as: admin });
    expect(outsider.status).toBe(403);
    expect(outsider.body.error.code).toBe("NO_ACCESS");
    expect(
      (
        await call(t.app, "GET", questionsPath("6f1f3f3a-1111-4111-8111-111111111111", "01"), {
          as: ana,
        })
      ).status,
    ).toBe(404);
    expect((await call(t.app, "GET", questionsPath(piaya, "01"))).status).toBe(401);
  });
});

describe("V3 answers", () => {
  test("creates, updates and records history; no-op writes nothing", async () => {
    const bike = await validationOf("bike-repair");
    const [idea] = await t.db
      .select()
      .from(schema.ideas)
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
    const key = "V.01.WHY_THEM";

    const created = await put(bike, key, { text: "Office workers in Bacolod", lockVersion: 0 });
    expect(created.status).toBe(200);
    validationAnswerSchema.parse(created.body);
    expect(created.body).toMatchObject({
      questionKey: key,
      text: "Office workers in Bacolod",
      lockVersion: 1,
      hidden: false,
      classification: { fau: null, state: "unclassified" },
    });
    expect(created.body.updatedBy.displayName).toBe("Ana Villanueva");
    let rows = await historyOf(bike, key);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      containerType: "validation",
      containerId: bike,
      sectionKey: "01",
      targetType: "validation_answer",
      targetId: bike,
      targetKey: key,
      action: "create",
      source: "manual",
      before: null,
      after: { text: "Office workers in Bacolod", fau: null, confidence: null, evidence: [] },
    });
    const [after] = await t.db
      .select()
      .from(schema.ideas)
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
    expect((after as { lastActivityAt: Date }).lastActivityAt.getTime()).toBeGreaterThan(
      (idea as { lastActivityAt: Date }).lastActivityAt.getTime(),
    );

    const updated = await put(
      bike,
      key,
      { text: "Office workers and students", lockVersion: 1 },
      kenji,
    );
    expect(updated.body.lockVersion).toBe(2);
    expect(updated.body.updatedBy.displayName).toBe("Kenji Mori");
    rows = await historyOf(bike, key);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      action: "update",
      before: { text: "Office workers in Bacolod" },
      after: { text: "Office workers and students" },
    });

    const same = await put(bike, key, { text: "Office workers and students", lockVersion: 2 });
    expect(same.status).toBe(200);
    expect(same.body.lockVersion).toBe(2);
    expect(await historyOf(bike, key)).toHaveLength(2);
    const empty = await put(bike, "V.01.FREQUENCY", { lockVersion: 0 });
    expect(empty.body).toMatchObject({ text: null, lockVersion: 0 });
    const blank = await put(bike, "V.01.FREQUENCY", { text: "   ", lockVersion: 0 });
    expect(blank.body).toMatchObject({ text: null, lockVersion: 0 });
    const rowsFor = await t.db
      .select()
      .from(schema.validationAnswers)
      .where(
        and(
          eq(schema.validationAnswers.validationId, bike),
          eq(schema.validationAnswers.questionKey, "V.01.FREQUENCY"),
        ),
      );
    expect(rowsFor).toHaveLength(0);
  });

  test("stale versions are 409 with the current content; force overwrites; a keyed item at version 0", async () => {
    const bike = await validationOf("bike-repair");
    const key = "V.01.SEVERITY";
    expect((await put(bike, key, { text: "first", lockVersion: 0 })).body.lockVersion).toBe(1);
    const lostRow = await put(bike, key, { text: "second", lockVersion: 0 }, kenji);
    expect(lostRow.status).toBe(409);
    expect(lostRow.body.error.code).toBe("CONFLICT");
    expect(lostRow.body.error.current).toMatchObject({
      lockVersion: 1,
      value: { questionKey: key, text: "first", lockVersion: 1 },
      updatedBy: { displayName: "Ana Villanueva" },
    });
    const forced = await put(bike, key, { text: "second", lockVersion: 0, force: true }, kenji);
    expect(forced.status).toBe(200);
    expect(forced.body.lockVersion).toBe(2);
    const rows = await historyOf(bike, key);
    expect(rows[rows.length - 1]).toMatchObject({
      before: { text: "first" },
      after: { text: "second" },
    });

    const noRowConflict = await put(bike, "V.01.PAYMENT", { text: "x", lockVersion: 3 });
    expect(noRowConflict.status).toBe(409);
    expect(noRowConflict.body.error.current).toMatchObject({
      lockVersion: 0,
      updatedAt: expect.any(String),
    });
  });

  test("two first writers of the same unanswered question: one wins, one gets 409", async () => {
    const bike = await validationOf("bike-repair");
    const results = await Promise.all([
      put(bike, "V.01.SWITCHING", { text: "from ana", lockVersion: 0 }, ana),
      put(bike, "V.01.SWITCHING", { text: "from kenji", lockVersion: 0 }, kenji),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const rows = await t.db
      .select()
      .from(schema.validationAnswers)
      .where(
        and(
          eq(schema.validationAnswers.validationId, bike),
          eq(schema.validationAnswers.questionKey, "V.01.SWITCHING"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(await historyOf(bike, "V.01.SWITCHING")).toHaveLength(1);
  });

  test("F/A/U rules through the API", async () => {
    const bike = await validationOf("bike-repair");
    const key = "V.01.BEHAVIOR";
    await put(bike, key, { text: "They walk the bike", lockVersion: 0 });

    const noConfidence = await put(bike, key, {
      classification: { fau: "assumption" },
      lockVersion: 1,
    });
    expect(noConfidence.status).toBe(422);
    expect(noConfidence.body.error.code).toBe("CONFIDENCE_REQUIRED");
    const noEvidence = await put(bike, key, { classification: { fau: "fact" }, lockVersion: 1 });
    expect(noEvidence.status).toBe(422);
    expect(noEvidence.body.error.code).toBe("FACT_REQUIRES_EVIDENCE");
    const stray = await put(bike, key, {
      classification: { fau: "unknown", confidence: "low" },
      lockVersion: 1,
    });
    expect(stray.status).toBe(422);
    expect(stray.body.error.code).toBe("VALIDATION_FAILED");

    const assumption = await put(bike, key, {
      classification: { fau: "assumption", confidence: "medium" },
      lockVersion: 1,
    });
    expect(assumption.body.classification).toMatchObject({
      fau: "assumption",
      confidence: "medium",
      state: "assumption",
    });
    expect(assumption.body.lockVersion).toBe(2);
    const unknown = await put(bike, key, { classification: { fau: "unknown" }, lockVersion: 2 });
    expect(unknown.body.classification).toMatchObject({
      fau: "unknown",
      confidence: null,
      state: "unknown",
    });
    expect(unknown.body.text).toBe("They walk the bike");
    const cleared = await put(bike, key, { text: null, lockVersion: 3 });
    expect(cleared.body).toMatchObject({
      text: null,
      classification: { fau: "unknown", state: "unknown" },
    });
    const reassumed = await put(bike, key, {
      text: "Back again",
      classification: { fau: "assumption", confidence: "high" },
      lockVersion: 4,
    });
    expect(reassumed.body.classification.state).toBe("assumption");
    const dropped = await put(bike, key, { text: "", lockVersion: 5 });
    expect(dropped.body).toMatchObject({
      text: null,
      classification: { fau: null, confidence: null, state: "empty" },
    });
    const rows = await historyOf(bike, key);
    expect(rows[rows.length - 1]).toMatchObject({
      before: { text: "Back again", fau: "assumption", confidence: "high" },
      after: { text: null, fau: null, confidence: null },
    });
  });

  test("an unevidenced Fact is refused until evidence exists; a Fact keeps its class when the text changes", async () => {
    const bike = await validationOf("bike-repair");
    const key = "V.02.DRIVERS";
    await put(bike, key, { text: "More commuters", lockVersion: 0 });
    const link = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: {
        target: { type: "validation_answer", id: bike, key },
        url: "https://example.com/commute",
        lockVersion: 1,
      },
    });
    expect(link.status).toBe(201);
    const fact = await put(bike, key, { classification: { fau: "fact" }, lockVersion: 2 });
    expect(fact.status).toBe(200);
    expect(fact.body.classification.state).toBe("fact");
    const edited = await put(bike, key, { text: "Many more commuters", lockVersion: 3 });
    expect(edited.body.classification.state).toBe("fact");
    expect(edited.body.classification.evidence).toHaveLength(1);
    const rows = await historyOf(bike, key);
    expect(rows[rows.length - 1]?.after).toMatchObject({
      fau: "fact",
      evidence: [link.body.evidence.id],
    });
  });

  test("choice questions accept only their choices; null clears", async () => {
    const laundry = await validationOf("laundry");
    const current = await call(t.app, "GET", questionsPath(laundry, "02"), { as: ana });
    const ocean = current.body.answers.find(
      (a: ValidationAnswer) => a.questionKey === "V.02.OCEAN",
    );
    const lock = ocean.lockVersion;
    const bad = await put(laundry, "V.02.OCEAN", { text: "Green", lockVersion: lock });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("INVALID_CHOICE");
    const lower = await put(laundry, "V.02.OCEAN", { text: "red", lockVersion: lock });
    expect(lower.body.error.code).toBe("INVALID_CHOICE");
    const ok = await put(laundry, "V.02.OCEAN", { text: "Blue", lockVersion: lock });
    expect(ok.status).toBe(200);
    expect(ok.body.text).toBe("Blue");
    const cleared = await put(laundry, "V.02.OCEAN", {
      text: null,
      lockVersion: ok.body.lockVersion,
    });
    expect(cleared.body).toMatchObject({ text: null, lockVersion: ok.body.lockVersion + 1 });
  });

  test("keys outside the pinned template are QUESTION_NOT_FOUND; 04 and 08 questions are answerable", async () => {
    const piaya = await validationOf("piaya");
    for (const key of ["V.99.NOPE", "V.01.REACH", "nonsense"]) {
      const res = await put(piaya, key, { text: "x", lockVersion: 0 });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("QUESTION_NOT_FOUND");
    }
    const bike = await validationOf("bike-repair");
    for (const [key, section] of [
      ["V.04.SURVIVOR_PATTERNS", "04"],
      ["V.04.FAILURE_PATTERNS", "04"],
      ["V.08.WORTH", "08"],
    ] as const) {
      const res = await put(bike, key, { text: "pattern", lockVersion: 0 });
      expect(res.status).toBe(200);
      expect((await historyOf(bike, key))[0]?.sectionKey).toBe(section);
    }
  });

  test("text over 20,000 characters and malformed bodies are 422 VALIDATION_FAILED", async () => {
    const bike = await validationOf("bike-repair");
    const long = await put(bike, "V.01.PROOF", { text: "a".repeat(20_001), lockVersion: 0 });
    expect(long.status).toBe(422);
    expect(long.body.error.code).toBe("VALIDATION_FAILED");
    expect(
      (await put(bike, "V.01.PROOF", { text: "a".repeat(20_000), lockVersion: 0 })).status,
    ).toBe(200);
    expect((await put(bike, "V.01.NON_CUSTOMER", { text: "x" })).status).toBe(422);
    expect((await put(bike, "V.01.NON_CUSTOMER", { text: "x", lockVersion: -1 })).status).toBe(422);
    expect(
      (await put(bike, "V.01.NON_CUSTOMER", { text: 5, lockVersion: 0 })).body.error.code,
    ).toBe("VALIDATION_FAILED");
  });

  test("roles: Viewer 403, outsider 403 NO_ACCESS, unknown validation 404, archived 409", async () => {
    const bike = await validationOf("bike-repair");
    const viewer = await put(bike, "V.02.MARKET_SIZE", { text: "x", lockVersion: 0 }, grace);
    expect(viewer.status).toBe(403);
    expect(viewer.body.error.code).toBe("FORBIDDEN");
    const outsider = await put(bike, "V.02.MARKET_SIZE", { text: "x", lockVersion: 0 }, admin);
    expect(outsider.body.error.code).toBe("NO_ACCESS");
    expect(
      (
        await put("6f1f3f3a-1111-4111-8111-111111111111", "V.02.MARKET_SIZE", {
          text: "x",
          lockVersion: 0,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(t.app, "PUT", answerPath(bike, "V.02.MARKET_SIZE"), {
          body: { text: "x", lockVersion: 0 },
        })
      ).status,
    ).toBe(401);
    expect((await put(bike, "V.02.MARKET_SIZE", { text: "x", lockVersion: 0 }, kenji)).status).toBe(
      200,
    );

    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
    const archived = await put(bike, "V.02.MARKET_SIZE", { text: "y", lockVersion: 1 });
    expect(archived.status).toBe(409);
    expect(archived.body.error.code).toBe("ARCHIVED");
    const archivedViewer = await put(
      bike,
      "V.02.MARKET_SIZE",
      { text: "y", lockVersion: 1 },
      grace,
    );
    expect(archivedViewer.status).toBe(403);
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: null })
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
  });
});

describe("V4 / V5 evidence", () => {
  const answerTarget = (validationId: string, key: string) => ({
    type: "validation_answer",
    id: validationId,
    key,
  });

  test("a URL and a research log with setFact, then removing evidence down to Unclassified", async () => {
    const bike = await validationOf("bike-repair");
    const key = "V.01.PAYMENT";
    await put(bike, key, { text: "They pay for convenience", lockVersion: 0 });

    const first = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: {
        target: answerTarget(bike, key),
        url: "https://example.com/survey",
        note: "Survey",
        setFact: true,
        lockVersion: 1,
      },
    });
    expect(first.status).toBe(201);
    createEvidenceResponseSchema.parse(first.body);
    expect(first.body.lockVersion).toBe(2);
    expect(first.body.evidence).toMatchObject({
      kind: "url",
      url: "https://example.com/survey",
      note: "Survey",
      researchLog: null,
    });
    expect(first.body.classification).toMatchObject({
      fau: "fact",
      confidence: null,
      state: "fact",
    });
    const rows = await historyOf(bike, key);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      action: "update",
      source: "manual",
      before: { fau: null, evidence: [] },
      after: { fau: "fact", evidence: [first.body.evidence.id] },
    });

    const [log] = await t.db
      .select()
      .from(schema.researchLogEntries)
      .where(eq(schema.researchLogEntries.validationId, await validationOf("piaya")))
      .limit(1);
    const piayaLog = (log as { id: string }).id;
    const crossWorkspace = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: { target: answerTarget(bike, key), researchLogEntryId: piayaLog, lockVersion: 2 },
    });
    expect(crossWorkspace.status).toBe(404);

    const mine = await call(t.app, "POST", `/api/v1/validations/${bike}/research-log`, {
      as: ana,
      body: {
        topic: "Bike shop visit",
        observedOn: "2026-09-30",
        supportsChecks: ["demand_signal"],
      },
    });
    const second = await call(t.app, "POST", evidencePath(bike), {
      as: kenji,
      body: { target: answerTarget(bike, key), researchLogEntryId: mine.body.id, lockVersion: 2 },
    });
    expect(second.status).toBe(201);
    expect(second.body.lockVersion).toBe(3);
    expect(second.body.evidence).toMatchObject({
      kind: "research_log",
      url: null,
      researchLog: {
        id: mine.body.id,
        topic: "Bike shop visit",
        observedOn: "2026-09-30",
        sourceType: null,
        deleted: false,
      },
    });
    expect(second.body.classification.evidence.map((e: { id: string }) => e.id)).toEqual([
      first.body.evidence.id,
      second.body.evidence.id,
    ]);
    const duplicate = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: { target: answerTarget(bike, key), researchLogEntryId: mine.body.id, lockVersion: 3 },
    });
    expect(duplicate.status).toBe(422);
    expect(duplicate.body.error.code).toBe("VALIDATION_FAILED");

    const stale = await call(
      t.app,
      "DELETE",
      `/api/v1/evidence/${first.body.evidence.id}?lockVersion=2`,
      { as: ana },
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error.current.lockVersion).toBe(3);
    expect(stale.body.error.current.value.classification.evidence).toHaveLength(2);

    const removedFirst = await call(
      t.app,
      "DELETE",
      `/api/v1/evidence/${first.body.evidence.id}?lockVersion=3`,
      { as: ana },
    );
    expect(removedFirst.status).toBe(200);
    expect(removedFirst.body.lockVersion).toBe(4);
    expect(removedFirst.body.classification).toMatchObject({ fau: "fact", state: "fact" });
    expect(removedFirst.body.classification.evidence).toHaveLength(1);

    const removedLast = await call(
      t.app,
      "DELETE",
      `/api/v1/evidence/${second.body.evidence.id}?lockVersion=4`,
      { as: ana },
    );
    expect(removedLast.status).toBe(200);
    expect(removedLast.body.lockVersion).toBe(5);
    expect(removedLast.body.classification).toMatchObject({
      fau: null,
      confidence: null,
      state: "unclassified",
      evidence: [],
    });
    const history = await historyOf(bike, key);
    expect(history[history.length - 1]).toMatchObject({
      before: { fau: "fact", evidence: [second.body.evidence.id] },
      after: { fau: null, evidence: [] },
    });
    const links = await t.db
      .select()
      .from(schema.evidenceLinks)
      .where(eq(schema.evidenceLinks.id, second.body.evidence.id));
    expect(links[0]?.deletedAt).not.toBeNull();
    expect(
      (
        await call(t.app, "DELETE", `/api/v1/evidence/${second.body.evidence.id}?lockVersion=5`, {
          as: ana,
        })
      ).status,
    ).toBe(404);

    const forced = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: { target: answerTarget(bike, key), url: "https://example.com/again", lockVersion: 5 },
    });
    expect(forced.body.lockVersion).toBe(6);
    const forcedRemoval = await call(
      t.app,
      "DELETE",
      `/api/v1/evidence/${forced.body.evidence.id}?lockVersion=0&force=true`,
      { as: ana },
    );
    expect(forcedRemoval.status).toBe(200);
    expect(forcedRemoval.body.lockVersion).toBe(7);
  });

  test("newResearchLog writes the log, the link and exactly two history rows in one transaction", async () => {
    const bike = await validationOf("bike-repair");
    const key = "V.01.NON_CUSTOMER";
    await put(bike, key, { text: "Car-only commuters", lockVersion: 0 });
    const before = await t.db.select().from(schema.changeHistory);
    const res = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: {
        target: answerTarget(bike, key),
        newResearchLog: {
          topic: "Traffic count",
          observation: "Many bikes at 8am",
          sourceType: "store_observation",
          supportsChecks: ["demand_signal"],
        },
        setFact: true,
        lockVersion: 1,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.evidence.researchLog).toMatchObject({
      topic: "Traffic count",
      sourceType: "store_observation",
    });
    expect(res.body.classification.state).toBe("fact");
    const after = await t.db.select().from(schema.changeHistory);
    expect(after.length - before.length).toBe(2);
    const created = after.filter((h) => !before.some((b) => b.id === h.id));
    const logRow = created.find((h) => h.targetType === "research_log_entry");
    expect(logRow).toMatchObject({
      action: "create",
      before: null,
      containerId: bike,
      source: "manual",
      targetId: res.body.evidence.researchLog.id,
      after: {
        topic: "Traffic count",
        observation: "Many bikes at 8am",
        supportsChecks: ["demand_signal"],
      },
    });
    expect(created.find((h) => h.targetType === "validation_answer")?.after).toMatchObject({
      fau: "fact",
    });
    const [entry] = await t.db
      .select()
      .from(schema.researchLogEntries)
      .where(eq(schema.researchLogEntries.id, res.body.evidence.researchLog.id));
    expect(entry).toMatchObject({ validationId: bike, lockVersion: 0, deletedAt: null });
  });

  test("a failing request leaves no log, no link and no history behind", async () => {
    const bike = await validationOf("bike-repair");
    const logs = (await t.db.select().from(schema.researchLogEntries)).length;
    const links = (await t.db.select().from(schema.evidenceLinks)).length;
    const history = (await t.db.select().from(schema.changeHistory)).length;
    const res = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: {
        target: answerTarget(bike, "V.01.REACH"),
        newResearchLog: { topic: "Orphan" },
        setFact: true,
        lockVersion: 0,
      },
    });
    expect(res.status).toBe(422);
    expect((await t.db.select().from(schema.researchLogEntries)).length).toBe(logs);
    expect((await t.db.select().from(schema.evidenceLinks)).length).toBe(links);
    expect((await t.db.select().from(schema.changeHistory)).length).toBe(history);
  });

  test("request validation: exactly one source, URL scheme, setFact needs a value and F/A/U", async () => {
    const bike = await validationOf("bike-repair");
    const target = answerTarget(bike, "V.01.REACH");
    const bodies: Record<string, unknown>[] = [
      { target, lockVersion: 0 },
      { target, url: "https://example.com", newResearchLog: { topic: "x" }, lockVersion: 0 },
      { target, url: "ftp://example.com", lockVersion: 0 },
      { target, url: "not a url", lockVersion: 0 },
      { target: { ...target, type: "risk" }, url: "https://example.com", lockVersion: 0 },
      { target, url: "https://example.com" },
      { target, newResearchLog: { topic: "" }, lockVersion: 0 },
    ];
    for (const body of bodies) {
      const res = await call(t.app, "POST", evidencePath(bike), { as: ana, body });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
    const noValue = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: { target, url: "https://example.com", setFact: true, lockVersion: 0 },
    });
    expect(noValue.status).toBe(422);
    expect(noValue.body.error.code).toBe("VALIDATION_FAILED");
    expect(noValue.body.error.details[0].message).toContain("value is required");
  });

  test("targets must belong to this validation: other validations' rows, unknown keys and ids are 404", async () => {
    const bike = await validationOf("bike-repair");
    const piaya = await validationOf("piaya");
    const [competitor] = await t.db
      .select()
      .from(schema.competitors)
      .where(eq(schema.competitors.validationId, piaya))
      .limit(1);
    const [cost] = await t.db
      .select()
      .from(schema.costItems)
      .where(eq(schema.costItems.validationId, piaya))
      .limit(1);
    const attempts = [
      { type: "competitor", id: (competitor as { id: string }).id },
      { type: "cost_item", id: (cost as { id: string }).id },
      { type: "assumption", id: (competitor as { id: string }).id },
      { type: "validation_answer", id: piaya, key: "V.01.WHO" },
      { type: "validation_answer", id: bike, key: "V.99.NOPE" },
      { type: "economics_input", id: bike, key: "not_a_field" },
      { type: "economics_input", id: piaya, key: "selling_price" },
    ];
    for (const target of attempts) {
      const res = await call(t.app, "POST", evidencePath(bike), {
        as: ana,
        body: { target, url: "https://example.com", lockVersion: 0 },
      });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    }
    const [piayaLinks] = await t.db
      .select()
      .from(schema.evidenceLinks)
      .where(eq(schema.evidenceLinks.validationId, piaya))
      .limit(1);
    const outsider = await call(
      t.app,
      "DELETE",
      `/api/v1/evidence/${(piayaLinks as { id: string }).id}?lockVersion=0`,
      { as: admin },
    );
    expect(outsider.status).toBe(403);
  });

  test("a numbers target without a row gets one at version 1; setFact needs its value", async () => {
    const bike = await validationOf("bike-repair");
    const target = { type: "economics_input", id: bike, key: "selling_price" };
    const stale = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: { target, url: "https://example.com/p", lockVersion: 4 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.current).toMatchObject({ lockVersion: 0 });
    const res = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: { target, url: "https://example.com/p", lockVersion: 0 },
    });
    expect(res.status).toBe(201);
    expect(res.body.lockVersion).toBe(1);
    expect(res.body.classification).toMatchObject({ fau: null, state: "empty" });
    const [row] = await t.db
      .select()
      .from(schema.economicsInputs)
      .where(
        and(
          eq(schema.economicsInputs.validationId, bike),
          eq(schema.economicsInputs.fieldKey, "selling_price"),
        ),
      );
    expect(row).toMatchObject({ lockVersion: 1, value: null });
    const history = await historyOf(bike, "selling_price");
    expect(history[0]).toMatchObject({
      sectionKey: "economics",
      targetType: "economics_input",
      action: "create",
      before: null,
    });
    const noValue = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: { target, url: "https://example.com/q", setFact: true, lockVersion: 1 },
    });
    expect(noValue.status).toBe(422);

    await t.db
      .update(schema.economicsInputs)
      .set({ value: 450 })
      .where(eq(schema.economicsInputs.id, (row as { id: string }).id));
    const fact = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: { target, url: "https://example.com/q", setFact: true, lockVersion: 1 },
    });
    expect(fact.status).toBe(201);
    expect(fact.body.classification).toMatchObject({ fau: "fact", state: "fact" });
    const removed = await call(
      t.app,
      "DELETE",
      `/api/v1/evidence/${res.body.evidence.id}?lockVersion=2`,
      { as: ana },
    );
    expect(removed.body.classification.state).toBe("fact");
    const last = await call(
      t.app,
      "DELETE",
      `/api/v1/evidence/${fact.body.evidence.id}?lockVersion=3`,
      { as: ana },
    );
    expect(last.body.classification).toMatchObject({ fau: null, state: "unclassified" });
  });

  test("cost items take Fact; competitors and assumptions take evidence but no F/A/U", async () => {
    const piaya = await validationOf("piaya");
    const [cost] = await t.db
      .select()
      .from(schema.costItems)
      .where(
        and(
          eq(schema.costItems.validationId, piaya),
          eq(schema.costItems.templateKey, "initial.permits"),
        ),
      );
    const costRow = cost as { id: string; lockVersion: number };
    const res = await call(t.app, "POST", evidencePath(piaya), {
      as: kenji,
      body: {
        target: { type: "cost_item", id: costRow.id },
        url: "https://example.com/permit-fee",
        setFact: true,
        lockVersion: costRow.lockVersion,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.lockVersion).toBe(costRow.lockVersion + 1);
    expect(res.body.classification.state).toBe("fact");
    const history = await historyOf(costRow.id);
    expect(history[history.length - 1]).toMatchObject({
      sectionKey: "costs",
      targetType: "cost_item",
      action: "update",
    });
    expect((history.at(-1) as { after: { evidence: string[] } }).after.evidence).toContain(
      res.body.evidence.id,
    );

    const [competitor] = await t.db
      .select()
      .from(schema.competitors)
      .where(eq(schema.competitors.validationId, piaya))
      .limit(1);
    const comp = competitor as { id: string; lockVersion: number };
    const withFact = await call(t.app, "POST", evidencePath(piaya), {
      as: ana,
      body: {
        target: { type: "competitor", id: comp.id },
        url: "https://example.com/c",
        setFact: true,
        lockVersion: comp.lockVersion,
      },
    });
    expect(withFact.status).toBe(422);
    expect(withFact.body.error.code).toBe("VALIDATION_FAILED");
    const ok = await call(t.app, "POST", evidencePath(piaya), {
      as: ana,
      body: {
        target: { type: "competitor", id: comp.id },
        url: "https://example.com/c",
        note: "Menu",
        lockVersion: comp.lockVersion,
      },
    });
    expect(ok.status).toBe(201);
    expect(ok.body.lockVersion).toBe(comp.lockVersion + 1);
    expect(ok.body.classification).toMatchObject({ fau: null, state: "unclassified" });
    const [updated] = await t.db
      .select()
      .from(schema.competitors)
      .where(eq(schema.competitors.id, comp.id));
    expect(updated?.lockVersion).toBe(comp.lockVersion + 1);
    const compHistory = await historyOf(comp.id);
    expect(compHistory[compHistory.length - 1]).toMatchObject({
      sectionKey: "competitors",
      targetType: "competitor",
    });

    const [assumption] = await t.db
      .select()
      .from(schema.assumptions)
      .where(eq(schema.assumptions.validationId, piaya))
      .limit(1);
    const asm = assumption as { id: string; lockVersion: number };
    const onAssumption = await call(t.app, "POST", evidencePath(piaya), {
      as: ana,
      body: {
        target: { type: "assumption", id: asm.id },
        url: "https://example.com/a",
        lockVersion: asm.lockVersion,
      },
    });
    expect(onAssumption.status).toBe(201);
    const removed = await call(
      t.app,
      "DELETE",
      `/api/v1/evidence/${onAssumption.body.evidence.id}?lockVersion=${onAssumption.body.lockVersion}`,
      { as: ana },
    );
    expect(removed.status).toBe(200);
    expect(removed.body.lockVersion).toBe(asm.lockVersion + 2);
  });

  test("roles and archive for V4 and V5", async () => {
    const bike = await validationOf("bike-repair");
    const key = "V.01.REACH";
    const body = { target: answerTarget(bike, key), url: "https://example.com", lockVersion: 0 };
    expect(
      (await call(t.app, "POST", evidencePath(bike), { as: grace, body })).body.error.code,
    ).toBe("FORBIDDEN");
    expect(
      (await call(t.app, "POST", evidencePath(bike), { as: admin, body })).body.error.code,
    ).toBe("NO_ACCESS");
    expect((await call(t.app, "POST", evidencePath(bike), { body })).status).toBe(401);
    expect(
      (
        await call(t.app, "POST", evidencePath("6f1f3f3a-1111-4111-8111-111111111111"), {
          as: ana,
          body,
        })
      ).status,
    ).toBe(404);

    const made = await call(t.app, "POST", evidencePath(bike), { as: ana, body });
    expect(made.status).toBe(201);
    const url = `/api/v1/evidence/${made.body.evidence.id}?lockVersion=${made.body.lockVersion}`;
    expect((await call(t.app, "DELETE", url, { as: grace })).body.error.code).toBe("FORBIDDEN");
    expect((await call(t.app, "DELETE", url, { as: admin })).body.error.code).toBe("NO_ACCESS");
    expect(
      (
        await call(
          t.app,
          "DELETE",
          `/api/v1/evidence/6f1f3f3a-1111-4111-8111-111111111111?lockVersion=0`,
          { as: ana },
        )
      ).status,
    ).toBe(404);
    expect(
      (await call(t.app, "DELETE", `/api/v1/evidence/${made.body.evidence.id}`, { as: ana }))
        .status,
    ).toBe(422);

    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
    expect((await call(t.app, "DELETE", url, { as: ana })).body.error.code).toBe("ARCHIVED");
    const archivedPost = await call(t.app, "POST", evidencePath(bike), {
      as: ana,
      body: { ...body, lockVersion: made.body.lockVersion },
    });
    expect(archivedPost.body.error.code).toBe("ARCHIVED");
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: null })
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
    expect((await call(t.app, "DELETE", url, { as: ana })).status).toBe(200);
  });
});
