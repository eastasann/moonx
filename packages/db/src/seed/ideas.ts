import type { ValidationState } from "@moonx/domain";
import type {
  Confidence,
  EconomicsField,
  Fau,
  SourceType,
  SupportsCheck,
} from "@moonx/schemas";
import { asc, eq } from "drizzle-orm";
import {
  assumptionContent,
  competitorContent,
  costItemContent,
  economicsInputContent,
  ideaContent,
  researchLogContent,
  riskContent,
  validationAnswerContent,
} from "../history-values";
import {
  assumptions,
  competitors,
  costItems,
  economicsInputs,
  evidenceLinks,
  ideas,
  researchLogEntries,
  risks,
  templateCostDefaults,
  templateQuestions,
  validationAnswers,
  validations,
} from "../schema";
import {
  BCDX_WORKSPACE_ID,
  type HistoryContainer,
  type SeedContext,
  type UserKey,
  userId,
} from "./context";
import { seedId } from "./ids";
import {
  type Earlier,
  type Edit,
  firstAndLast,
  recordRevisions,
  type When,
} from "./revisions";

/** One piece of evidence (M2): a research log of the same idea, or a URL. */
export type EvidenceSpec =
  | { log: string; url?: never; note?: never }
  | { url: string; note?: string; log?: never };

/**
 * F/A/U of an answer, cost row or number (design-spec 6.0.3). Evidence goes with Fact
 * only: M2 opens from the Fact button, and a Fact needs at least one piece.
 */
export interface Classified {
  fau?: Fau | null;
  confidence?: Confidence | null;
  evidence?: EvidenceSpec[];
}

interface AnswerState {
  text: string;
  fau: Fau | null;
  confidence: Confidence | null;
}

export interface AnswerSpec extends Classified {
  text: string;
  /** The current save; defaults to the proposer on the idea's `workedDaysAgo`. */
  edit?: Edit;
  earlier?: Earlier<AnswerState>;
}

interface NumberState {
  value: number | null;
  fau: Fau | null;
  confidence: Confidence | null;
}

export interface NumberSpec extends Classified {
  value: number | null;
  edit?: Edit;
  earlier?: Earlier<NumberState>;
}

export interface CostSpec extends Classified {
  amount?: number;
  /** A 0–1 rate of the selling price; variable rows only. */
  percent?: number;
  whyNeeded?: string;
  canReduce?: "yes" | "partly" | "no";
  notes?: string;
}

export interface ResearchLogSpec {
  key: string;
  /** Observed and recorded this many days before the run. */
  daysAgo: number;
  topic: string;
  observation?: string;
  sourceType?: SourceType;
  sourceUrl?: string;
  supports?: SupportsCheck[];
  supportsNote?: string;
  by: UserKey;
  /** Deleted on 14 this many days before the run. */
  deleted?: When;
}

export interface CompetitorSpec {
  name: string;
  type?: "direct" | "indirect" | "substitute";
  targetCustomer?: string;
  offering?: string;
  typicalPrice?: number;
  priceNote?: string;
  strength?: string;
  weakness?: string;
  whyChosen?: string;
  whySurvive?: string;
  evidence?: EvidenceSpec[];
}

export interface AssumptionSpec {
  statement: string;
  whyBelieve?: string;
  evidenceNote?: string;
  confidence?: Confidence;
  disproveCondition?: string;
  nextCheck?: string;
  evidence?: EvidenceSpec[];
}

export interface RiskSpec {
  statement: string;
  probability?: Confidence;
  impact?: Confidence;
  whyMatters?: string;
  mitigation?: string;
  howToValidate?: string;
}

/** One idea of design-spec 8.2 and its validation. */
export interface IdeaSpec {
  key: string;
  name: string;
  oneLineConcept: string;
  proposedSolution: string | null;
  proposer: UserKey;
  createdDaysAgo: number;
  /** The validation template version it was made on. */
  template: "v1" | "v2";
  archived?: { daysAgo: number };
  /** When the answers, numbers and rows without a time of their own were saved. */
  workedDaysAgo: number;
  /** By question ID. */
  answers: Record<string, AnswerSpec>;
  researchLogs: ResearchLogSpec[];
  competitors: CompetitorSpec[];
  assumptions: AssumptionSpec[];
  risks: RiskSpec[];
  /** By the template's cost row key. Template rows left out stay empty. */
  costs: Record<string, CostSpec>;
  economics: Partial<Record<EconomicsField, NumberSpec>>;
}

/** A duplicate (6.8): every row is new, written at once by one operation. */
export interface CopyOf {
  ideaId: string;
  by: UserKey;
  daysAgo: number;
  hoursAgo?: number;
}

/** The ids the rest of the seed needs of a written idea. */
export interface WrittenIdea {
  spec: IdeaSpec;
  ideaId: string;
  validationId: string;
  createdAt: Date;
  /** When competitors, assumptions, risks and the cost rows' values were saved. */
  workedAt: Date;
  costRowId: (templateKey: string) => string;
  /** Research logs by key, with what M5 and the plan references show of them. */
  researchLogs: Map<string, { id: string; observedOn: string; topic: string }>;
  /** Every save of each answer and number, oldest first, to read them at a past moment. */
  answerSaves: Map<string, { state: AnswerState; at: Date }[]>;
  numberSaves: Map<EconomicsField, { state: NumberState; at: Date }[]>;
  /** When each research log, by key, was recorded and deleted. */
  logTimes: Map<string, { recordedAt: Date; deletedAt: Date | null }>;
}

const answerSection = (questionKey: string) =>
  questionKey.split(".")[1] ?? null;

const checkClassified = (label: string, item: Classified) => {
  const evidence = item.evidence ?? [];
  if (item.fau === "fact" && evidence.length === 0)
    throw new Error(`${label} is a Fact without evidence`);
  if (item.fau !== "fact" && evidence.length > 0)
    throw new Error(`${label} has evidence but is not a Fact`);
  if ((item.fau === "assumption") !== (item.confidence != null))
    throw new Error(`${label} needs a confidence exactly when an Assumption`);
};

/**
 * Writes an idea, its validation and everything in it: answers, research logs,
 * competitors, assumptions, risks, the template's cost rows (as M1 makes them) and the
 * numbers, with their evidence links and history. A duplicate writes every row in one
 * `duplicate` operation and copies no history (6.8).
 */
export async function writeIdea(
  { tx, clock, templates, history, activity }: SeedContext,
  spec: IdeaSpec,
  copy?: CopyOf,
): Promise<WrittenIdea> {
  const ideaId = seedId("idea", spec.key);
  const validationId = seedId("validation", spec.key);
  const templateVersionId = templates.validation[spec.template];
  const at = (when: { daysAgo: number; hoursAgo?: number }) =>
    clock.ago(when.daysAgo, when.hoursAgo);
  const createdAt =
    copy === undefined ? at({ daysAgo: spec.createdDaysAgo }) : at(copy);
  const worked: When = copy ?? {
    daysAgo: spec.workedDaysAgo,
    by: spec.proposer,
  };
  const copyEdit: Edit | undefined =
    copy === undefined
      ? undefined
      : { ...copy, source: "duplicate", batch: `duplicate/${spec.key}` };
  const ideaContainer: HistoryContainer = {
    type: "idea",
    id: ideaId,
    workspaceId: BCDX_WORKSPACE_ID,
    ownerUserId: null,
  };
  const container: HistoryContainer = {
    type: "validation",
    id: validationId,
    workspaceId: BCDX_WORKSPACE_ID,
    ownerUserId: null,
  };
  const touch = (moment: Date) =>
    activity.touch(BCDX_WORKSPACE_ID, ideaId, moment);
  touch(createdAt);
  /**
   * The create row of a row: one row of the duplicate operation for a copy, a manual save
   * for an idea made by hand.
   */
  const created = (
    sectionKey: string | null,
    target: { type: string; id: string; key?: string | null },
    after: unknown,
    when: When,
    into: HistoryContainer = container,
  ) =>
    history.add({
      container: into,
      sectionKey,
      target,
      action: "create",
      before: null,
      after,
      source: copyEdit === undefined ? "manual" : "duplicate",
      batch: copyEdit?.batch,
      by: when.by,
      at: at(when),
      client: when.client,
    });

  const ideaRow = {
    name: spec.name,
    oneLineConcept: spec.oneLineConcept,
    proposedSolution: spec.proposedSolution,
  };
  await tx.insert(ideas).values({
    id: ideaId,
    workspaceId: BCDX_WORKSPACE_ID,
    ...ideaRow,
    proposerId: userId(copy?.by ?? spec.proposer),
    duplicatedFromId: copy?.ideaId ?? null,
    archivedAt: spec.archived === undefined ? null : at(spec.archived),
    updatedById: userId(copy?.by ?? spec.proposer),
    createdAt,
    updatedAt: createdAt,
  });
  created(
    null,
    { type: "idea", id: ideaId },
    ideaContent(ideaRow),
    copy ?? { daysAgo: spec.createdDaysAgo, by: spec.proposer },
    ideaContainer,
  );
  await tx.insert(validations).values({
    id: validationId,
    ideaId,
    templateVersionId,
    createdAt,
    updatedAt: createdAt,
  });

  // Research logs come first: evidence points at them.
  const logs = spec.researchLogs.filter(
    // A duplicate copies what the idea has; a deleted log is not part of it (SDD 6.5).
    (log) => copy === undefined || log.deleted === undefined,
  );
  // A copy keeps the order of rows that lists sort by when they were made, as I3 does:
  // each is made a millisecond after the one before it, logs in the order they were
  // recorded, then the evidence.
  const copied = (index: number) => new Date(createdAt.getTime() + index);
  const copyOrder = logs
    .map((log, index) => ({ log, index }))
    .sort((a, b) => b.log.daysAgo - a.log.daysAgo || a.index - b.index)
    .map(({ log }) => log);
  const logRows = logs.map((log) => {
    const recordedAt =
      copy === undefined ? at(log) : copied(copyOrder.indexOf(log));
    return {
      id: seedId("research_log", spec.key, log.key),
      validationId,
      observedOn: clock.date(-log.daysAgo),
      topic: log.topic,
      observation: log.observation ?? null,
      sourceType: log.sourceType ?? null,
      sourceUrl: log.sourceUrl ?? null,
      supportsChecks: log.supports ?? [],
      supportsNote: log.supportsNote ?? null,
      createdById: userId(copy?.by ?? log.by),
      deletedAt:
        copy === undefined && log.deleted !== undefined
          ? at(log.deleted)
          : null,
      updatedById: userId(copy?.by ?? log.by),
      createdAt: recordedAt,
      updatedAt: recordedAt,
    };
  });
  if (logRows.length > 0) await tx.insert(researchLogEntries).values(logRows);
  logs.forEach((log, index) => {
    const row = logRows[index];
    if (row === undefined) return;
    const target = { type: "research_log_entry", id: row.id };
    created("research_log", target, researchLogContent(row), copy ?? log);
    if (copy !== undefined || log.deleted === undefined) return;
    touch(at(log.deleted));
    history.add({
      container,
      sectionKey: "research_log",
      target,
      action: "delete",
      before: researchLogContent(row),
      after: null,
      source: "manual",
      by: log.deleted.by,
      at: at(log.deleted),
      client: log.deleted.client,
    });
  });
  const logIds = new Map(
    logs.map((log, index) => [log.key, logRows[index]?.id ?? ""]),
  );
  const logRecordedAt = new Map(
    logs.map((log, index) => [log.key, logRows[index]?.createdAt]),
  );
  const uncopiedLogs = new Set(
    spec.researchLogs
      .filter((log) => !logs.includes(log))
      .map((log) => log.key),
  );

  const evidenceRows: (typeof evidenceLinks.$inferInsert)[] = [];
  /** The evidence a copy keeps: a duplicate moves it onto the copied logs. */
  const kept = (evidence: EvidenceSpec[] | undefined) =>
    (evidence ?? []).flatMap((piece, index) =>
      piece.log !== undefined && uncopiedLogs.has(piece.log)
        ? []
        : [{ piece, index }],
    );
  const evidenceIdsOf = (label: string, evidence: EvidenceSpec[] | undefined) =>
    kept(evidence).map(({ index }) =>
      seedId("evidence", spec.key, label, index),
    );
  /** Writes the links of `evidence`, attached at `when`, and returns their ids. */
  const attach = (
    label: string,
    target: {
      type: (typeof evidenceLinks.$inferInsert)["targetType"];
      id: string;
      key?: string;
    },
    evidence: EvidenceSpec[] | undefined,
    when: { at: Date; by: UserKey },
  ): string[] =>
    kept(evidence).map(({ piece, index }) => {
      const logId = piece.log === undefined ? null : logIds.get(piece.log);
      if (logId === undefined)
        throw new Error(`${label} cites an unknown research log ${piece.log}`);
      const recordedAt =
        piece.log === undefined ? undefined : logRecordedAt.get(piece.log);
      // Evidence put on an item at once is made in the order listed, a millisecond
      // apart, so it lists in that order (by when it was made) here and in a copy.
      const madeAt =
        copy === undefined
          ? new Date(when.at.getTime() + index)
          : copied(logRows.length + evidenceRows.length);
      if (recordedAt !== undefined && madeAt < recordedAt)
        throw new Error(`${label} cites ${piece.log} before it is recorded`);
      const id = seedId("evidence", spec.key, label, index);
      evidenceRows.push({
        id,
        workspaceId: BCDX_WORKSPACE_ID,
        validationId,
        targetType: target.type,
        targetId: target.id,
        targetKey: target.key ?? null,
        researchLogEntryId: logId,
        url: piece.url ?? null,
        note: piece.note ?? null,
        createdById: userId(when.by),
        createdAt: madeAt,
        updatedAt: madeAt,
      });
      return id;
    });
  const workedAt = { at: at(worked), by: worked.by };

  const competitorRows = spec.competitors.map((competitor, index) => {
    const id = seedId("competitor", spec.key, index);
    const evidenceIds = attach(
      `competitor/${index}`,
      { type: "competitor", id },
      competitor.evidence,
      workedAt,
    );
    const content = {
      name: competitor.name,
      type: competitor.type ?? null,
      targetCustomer: competitor.targetCustomer ?? null,
      offering: competitor.offering ?? null,
      typicalPrice: competitor.typicalPrice ?? null,
      priceNote: competitor.priceNote ?? null,
      strength: competitor.strength ?? null,
      weakness: competitor.weakness ?? null,
      whyChosen: competitor.whyChosen ?? null,
      whySurvive: competitor.whySurvive ?? null,
    };
    created(
      "competitors",
      { type: "competitor", id },
      competitorContent(content, evidenceIds),
      worked,
    );
    return {
      id,
      validationId,
      ...content,
      sortOrder: index,
      updatedById: userId(worked.by),
      createdAt: at(worked),
      updatedAt: at(worked),
    };
  });
  if (competitorRows.length > 0)
    await tx.insert(competitors).values(competitorRows);

  const assumptionRows = spec.assumptions.map((assumption, index) => {
    const id = seedId("assumption", spec.key, index);
    const evidenceIds = attach(
      `assumption/${index}`,
      { type: "assumption", id },
      assumption.evidence,
      workedAt,
    );
    const content = {
      statement: assumption.statement,
      whyBelieve: assumption.whyBelieve ?? null,
      evidenceNote: assumption.evidenceNote ?? null,
      confidence: assumption.confidence ?? null,
      disproveCondition: assumption.disproveCondition ?? null,
      nextCheck: assumption.nextCheck ?? null,
    };
    created(
      "assumptions_risks",
      { type: "assumption", id },
      assumptionContent(content, evidenceIds),
      worked,
    );
    return {
      id,
      validationId,
      ...content,
      sortOrder: index,
      updatedById: userId(worked.by),
      createdAt: at(worked),
      updatedAt: at(worked),
    };
  });
  if (assumptionRows.length > 0)
    await tx.insert(assumptions).values(assumptionRows);

  const riskRows = spec.risks.map((risk, index) => {
    const id = seedId("risk", spec.key, index);
    const content = {
      statement: risk.statement,
      probability: risk.probability ?? null,
      impact: risk.impact ?? null,
      whyMatters: risk.whyMatters ?? null,
      mitigation: risk.mitigation ?? null,
      howToValidate: risk.howToValidate ?? null,
    };
    created(
      "assumptions_risks",
      { type: "risk", id },
      riskContent(content),
      worked,
    );
    return {
      id,
      validationId,
      ...content,
      // Null keeps 16's automatic order (Impact, then Probability).
      sortOrder: null,
      updatedById: userId(worked.by),
      createdAt: copy === undefined ? at(worked) : copied(index),
      updatedAt: copy === undefined ? at(worked) : copied(index),
    };
  });
  if (riskRows.length > 0) await tx.insert(risks).values(riskRows);

  // M1 makes a row for each of the template's cost rows; the spec fills some of them.
  const defaults = await tx
    .select()
    .from(templateCostDefaults)
    .where(eq(templateCostDefaults.templateVersionId, templateVersionId))
    .orderBy(asc(templateCostDefaults.sortOrder));
  for (const key of Object.keys(spec.costs))
    if (!defaults.some((row) => row.key === key))
      throw new Error(`${spec.key}: no template cost row ${key}`);
  const costRowId = (key: string) => seedId("cost_item", spec.key, key);
  const costRows = defaults.map((row) => {
    const cost = spec.costs[row.key];
    const id = costRowId(row.key);
    checkClassified(`${spec.key} ${row.key}`, cost ?? {});
    if (cost?.percent !== undefined && row.category !== "variable")
      throw new Error(
        `${spec.key} ${row.key}: a percentage on a non-variable row`,
      );
    const target = { type: "cost_item" as const, id };
    const empty = {
      category: row.category,
      templateKey: row.key,
      name: row.name,
      inputMode: "amount" as "amount" | "percent_of_price",
      amount: null as number | null,
      percent: null as number | null,
      isLumpSum: false,
      whyNeeded: null as string | null,
      canReduce: null as CostSpec["canReduce"] | null,
      notes: null as string | null,
      fau: null as Fau | null,
      confidence: null as Confidence | null,
    };
    const content =
      cost === undefined
        ? empty
        : {
            ...empty,
            inputMode:
              cost.percent === undefined
                ? ("amount" as const)
                : ("percent_of_price" as const),
            amount: cost.amount ?? null,
            percent: cost.percent ?? null,
            whyNeeded: cost.whyNeeded ?? null,
            canReduce: cost.canReduce ?? null,
            notes: cost.notes ?? null,
            fau: cost.fau ?? null,
            confidence: cost.confidence ?? null,
          };
    const sortOrder = defaults
      .filter((other) => other.category === row.category)
      .indexOf(row);
    const base = { id, validationId, sortOrder, createdAt };
    if (copyEdit !== undefined) {
      const evidenceIds = attach(`cost/${row.key}`, target, cost?.evidence, {
        at: createdAt,
        by: copyEdit.by,
      });
      created("costs", target, costItemContent(content, evidenceIds), copyEdit);
      return {
        ...base,
        ...content,
        updatedById: userId(copyEdit.by),
        updatedAt: createdAt,
      };
    }
    // M1 makes the row empty; filling it in on 17 is a later save.
    created("costs", target, costItemContent(empty, []), {
      daysAgo: spec.createdDaysAgo,
      by: spec.proposer,
    });
    if (cost === undefined)
      return {
        ...base,
        ...empty,
        updatedById: userId(spec.proposer),
        updatedAt: createdAt,
      };
    const evidenceIds = attach(
      `cost/${row.key}`,
      target,
      cost.evidence,
      workedAt,
    );
    history.add({
      container,
      sectionKey: "costs",
      target,
      action: "update",
      before: costItemContent(empty, []),
      after: costItemContent(content, evidenceIds),
      source: "manual",
      by: worked.by,
      at: workedAt.at,
    });
    return {
      ...base,
      ...content,
      lockVersion: 1,
      updatedById: userId(worked.by),
      updatedAt: workedAt.at,
    };
  });
  await tx.insert(costItems).values(costRows);

  const keyed = <State extends { fau: Fau | null }>(
    label: string,
    target: {
      type: "validation_answer" | "economics_input";
      key: string;
      sectionKey: string | null;
    },
    item: Classified & { edit?: Edit; earlier?: Earlier<State> },
    state: State,
    payload: (state: State, evidenceIds: string[]) => unknown,
  ) => {
    checkClassified(label, item);
    const ref = { type: target.type, id: validationId, key: target.key };
    const evidenceIds = evidenceIdsOf(label, item.evidence);
    if (copyEdit !== undefined) {
      attach(label, ref, item.evidence, { at: createdAt, by: copyEdit.by });
      created(target.sectionKey, ref, payload(state, evidenceIds), copyEdit);
      return { by: copyEdit.by, saves: [{ state, at: createdAt }] };
    }
    const edit = item.edit ?? worked;
    const saves = recordRevisions(
      history,
      at,
      { container, sectionKey: target.sectionKey, target: ref },
      { state, edit },
      item.earlier ?? [],
      (saved) => payload(saved, evidenceIds),
    );
    // The evidence was attached by the first save that made it a Fact (M2).
    const factSave = saves.find((save) => save.state.fau === "fact");
    if (factSave !== undefined)
      attach(label, ref, item.evidence, { at: factSave.at, by: factSave.by });
    return { by: edit.by, saves };
  };

  const questionKeys = new Set(
    (
      await tx
        .select({ key: templateQuestions.questionKey })
        .from(templateQuestions)
        .where(eq(templateQuestions.templateVersionId, templateVersionId))
    ).map((row) => row.key),
  );
  const answerSaves = new Map<string, { state: AnswerState; at: Date }[]>();
  const answerRows = Object.entries(spec.answers).map(([key, answer]) => {
    if (!questionKeys.has(key))
      throw new Error(`${spec.key}: ${key} is not in its template version`);
    const state: AnswerState = {
      text: answer.text,
      fau: answer.fau ?? null,
      confidence: answer.confidence ?? null,
    };
    const saved = keyed(
      `answer/${key}`,
      { type: "validation_answer", key, sectionKey: answerSection(key) },
      answer,
      state,
      // The evidence was attached by the save that made it a Fact (M2).
      (s, evidenceIds) =>
        validationAnswerContent(s, s.fau === "fact" ? evidenceIds : []),
    );
    answerSaves.set(key, saved.saves);
    const { first, last } = firstAndLast(saved.saves);
    touch(last);
    return {
      id: seedId("validation_answer", spec.key, key),
      validationId,
      questionKey: key,
      ...state,
      lockVersion: saved.saves.length,
      updatedById: userId(saved.by),
      createdAt: first,
      updatedAt: last,
    };
  });
  if (answerRows.length > 0)
    await tx.insert(validationAnswers).values(answerRows);

  const numberSaves = new Map<
    EconomicsField,
    { state: NumberState; at: Date }[]
  >();
  const inputRows = (
    Object.entries(spec.economics) as [EconomicsField, NumberSpec][]
  ).map(([field, input]) => {
    const state: NumberState = {
      value: input.value,
      fau: input.fau ?? null,
      confidence: input.confidence ?? null,
    };
    const saved = keyed(
      `economics/${field}`,
      { type: "economics_input", key: field, sectionKey: "economics" },
      input,
      state,
      (s, evidenceIds) =>
        economicsInputContent(s, s.fau === "fact" ? evidenceIds : []),
    );
    numberSaves.set(field, saved.saves);
    const { first, last } = firstAndLast(saved.saves);
    touch(last);
    return {
      id: seedId("economics_input", spec.key, field),
      validationId,
      fieldKey: field,
      ...state,
      lockVersion: saved.saves.length,
      updatedById: userId(saved.by),
      createdAt: first,
      updatedAt: last,
    };
  });
  if (inputRows.length > 0) await tx.insert(economicsInputs).values(inputRows);

  if (evidenceRows.length > 0)
    await tx.insert(evidenceLinks).values(evidenceRows);
  if (copy === undefined) touch(workedAt.at);

  return {
    spec,
    ideaId,
    validationId,
    createdAt,
    workedAt: workedAt.at,
    costRowId,
    researchLogs: new Map(
      logs.flatMap((log, index) => {
        const row = logRows[index];
        return row === undefined || row.deletedAt !== null
          ? []
          : [
              [
                log.key,
                { id: row.id, observedOn: row.observedOn, topic: row.topic },
              ],
            ];
      }),
    ),
    answerSaves,
    numberSaves,
    logTimes: new Map(
      logs.flatMap((log, index) => {
        const row = logRows[index];
        return row === undefined
          ? []
          : [
              [
                log.key,
                { recordedAt: row.createdAt, deletedAt: row.deletedAt },
              ],
            ];
      }),
    ),
  };
}

/**
 * `state` as it stood at `moment`: each answer and number as last saved by then (left out
 * if not saved yet), the research logs recorded by then and not yet deleted, with the
 * evidence they gave, and before the idea's `workedAt` no competitors, assumptions or
 * risks and empty cost rows (as M1 made them). For the snapshots of decisions and
 * versions recorded before later changes.
 */
export function validationStateAt(
  state: ValidationState,
  idea: WrittenIdea,
  moment: Date,
): ValidationState {
  const logLive = (key: string) => {
    const times = idea.logTimes.get(key);
    return (
      times !== undefined &&
      times.recordedAt <= moment &&
      (times.deletedAt === null || times.deletedAt > moment)
    );
  };
  const activeEvidence = (evidence: EvidenceSpec[] | undefined) =>
    (evidence ?? []).filter(
      (piece) => piece.log === undefined || logLive(piece.log),
    ).length;
  const savedBy = <S>(saves: { state: S; at: Date }[] | undefined) =>
    (saves ?? []).filter((save) => save.at <= moment).at(-1)?.state;
  const worked = moment >= idea.workedAt;
  return {
    ...state,
    competitors: worked ? state.competitors : [],
    assumptionCount: worked ? state.assumptionCount : 0,
    riskCount: worked ? state.riskCount : 0,
    costRows: worked
      ? state.costRows
      : state.costRows.map((row) => ({
          ...row,
          inputMode: "amount" as const,
          amount: null,
          percent: null,
          fau: null,
          confidence: null,
          activeEvidenceCount: 0,
        })),
    answers: Object.entries(idea.spec.answers).flatMap(([key, answer]) => {
      const saved = savedBy(idea.answerSaves.get(key));
      return saved === undefined
        ? []
        : [
            {
              questionKey: key,
              text: saved.text,
              fau: saved.fau,
              confidence: saved.confidence,
              activeEvidenceCount: activeEvidence(answer.evidence),
            },
          ];
    }),
    researchLogs: idea.spec.researchLogs
      .filter((log) => logLive(log.key))
      .map((log) => ({ supportsChecks: log.supports ?? [] })),
    economicsInputs: (
      Object.entries(idea.spec.economics) as [EconomicsField, NumberSpec][]
    ).flatMap(([field, input]) => {
      const saved = savedBy(idea.numberSaves.get(field));
      return saved === undefined
        ? []
        : [
            {
              fieldKey: field,
              value: saved.value,
              fau: saved.fau,
              confidence: saved.confidence,
              activeEvidenceCount: activeEvidence(input.evidence),
            },
          ];
    }),
  };
}
