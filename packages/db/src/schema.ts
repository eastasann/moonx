import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- 共通の列 ----------
const pk = () => uuid().primaryKey().defaultRandom();
const ts = () => timestamp({ withTimezone: true });
const timestamps = () => ({
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
// 版を持つ項目（ADR-019）
const versioned = () => ({
  lockVersion: integer().notNull().default(0),
  updatedById: uuid().references((): AnyPgColumn => users.id, { onDelete: "set null" }),
});
const money = () => numeric({ precision: 15, scale: 2, mode: "number" }); // 金額
const ratio = () => numeric({ precision: 7, scale: 4, mode: "number" }); // 0.3500 = 35%

// ---------- enum ----------
export const userStatus = pgEnum("user_status", ["active", "suspended", "deleted"]);
export const themePref = pgEnum("theme_pref", ["system", "light", "dark"]);
export const workspaceRole = pgEnum("workspace_role", ["owner", "member", "viewer"]);
export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);
export const templateKind = pgEnum("template_kind", [
  "self_analysis",
  "validation",
  "business_plan",
]);
export const templateVersionStatus = pgEnum("template_version_status", ["draft", "published"]);
export const planPart = pgEnum("plan_part", ["a", "b"]);
export const answerType = pgEnum("answer_type", [
  "long_text",
  "short_text",
  "choice",
  "amount_with_reason",
  "table",
  "linked_metric",
  "execution_view",
]);
export const costCategory = pgEnum("cost_category", ["initial", "monthly_fixed", "variable"]);
export const checkKey = pgEnum("check_key", [
  "competitors",
  "local_price",
  "costs",
  "break_even",
  "permits",
  "demand_signal",
]);
export const executionType = pgEnum("execution_type", [
  "milestone",
  "launch",
  "kpi",
  "open_question",
  "next_action",
]);
export const presetType = pgEnum("preset_type", ["milestone", "launch", "kpi"]);
export const launchTiming = pgEnum("launch_timing", [
  "t_minus_30",
  "t_minus_7",
  "launch_day",
  "first_30",
  "days_31_90",
  "other",
]);
export const selfAnalysisStatus = pgEnum("self_analysis_status", [
  "not_started",
  "in_progress",
  "done",
]);
export const decisionValue = pgEnum("decision_value", ["proceed", "hold", "drop"]);
export const fau = pgEnum("fau", ["fact", "assumption", "unknown"]);
export const level = pgEnum("level", ["low", "medium", "high"]); // 確信度・確率・影響
export const sourceType = pgEnum("source_type", [
  "google_maps_reviews",
  "website",
  "social_media",
  "public_data",
  "news_report",
  "store_observation",
  "price_check",
  "other",
]);
export const supportsCheck = pgEnum("supports_check", ["local_price", "permits", "demand_signal"]);
export const competitorType = pgEnum("competitor_type", ["direct", "indirect", "substitute"]);
export const canReduce = pgEnum("can_reduce", ["yes", "partly", "no"]);
export const costInputMode = pgEnum("cost_input_mode", ["amount", "percent_of_price"]);
export const economicsField = pgEnum("economics_field", [
  "selling_price",
  "operating_days",
  "target_margin",
  "units_conservative",
  "units_expected",
  "units_strong",
  "units_capacity",
]);
export const evidenceTargetType = pgEnum("evidence_target_type", [
  "validation_answer",
  "cost_item",
  "economics_input",
  "competitor",
  "assumption",
]);
export const executionStatus = pgEnum("execution_status", [
  "todo",
  "doing",
  "done",
  "open",
  "resolved",
]);
export const decisionKind = pgEnum("decision_kind", [
  "validation_decision",
  "go_no_go",
  "version_saved",
]);
export const decisionLogValue = pgEnum("decision_log_value", [
  "proceed",
  "hold",
  "drop",
  "launch",
  "delay",
  "stop",
]);
export const commentTargetType = pgEnum("comment_target_type", [
  "self_analysis_answer",
  "validation_answer",
  "research_log_entry",
  "competitor",
  "assumption",
  "risk",
  "cost_item",
  "economics_input",
  "plan_answer",
  "execution_item",
  "pitch_slide",
  "idea",
]);
export const notificationKind = pgEnum("notification_kind", ["mention", "comment", "decision"]);
export const historyAction = pgEnum("history_action", ["create", "update", "delete", "restore"]);
export const historySource = pgEnum("history_source", [
  "manual",
  "ai_import",
  "revert",
  "template_migration",
  "duplicate",
  "plan_draft",
]);
export const historyContainer = pgEnum("history_container", [
  "self_analysis",
  "validation",
  "business_plan",
  "idea",
]);
export const clientKind = pgEnum("client_kind", ["web", "ios", "android", "unknown"]);

// ---------- 認証（Better Auth。auth の設定で列名を対応させる） ----------
export const users = pgTable(
  "users",
  {
    id: pk(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    displayName: text().notNull(), // Better Auth の name
    avatarUrl: text(), // Better Auth の image
    isAdmin: boolean().notNull().default(false),
    status: userStatus().notNull().default("active"),
    theme: themePref().notNull().default("system"),
    timezone: text().notNull().default("Asia/Manila"), // IANA 名。登録時に端末から取る
    lastWorkspaceId: uuid().references((): AnyPgColumn => workspaces.id, { onDelete: "set null" }),
    lastActiveAt: ts(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: ts().notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps(),
  },
  (t) => [index().on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text().notNull(), // プロバイダ側の ID
    providerId: text().notNull(), // "credential" | "google"
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: ts(),
    refreshTokenExpiresAt: ts(),
    scope: text(),
    password: text(), // ハッシュ（credential のときだけ）
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.providerId, t.accountId), index().on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: pk(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: ts().notNull(),
    ...timestamps(),
  },
  (t) => [index().on(t.identifier)],
);

export const rateLimits = pgTable("rate_limits", {
  id: pk(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

// ---------- ワークスペース ----------
export const workspaces = pgTable("workspaces", {
  id: pk(),
  name: text().notNull(),
  currency: text().notNull().default("PHP"), // ISO 4217
  isPersonal: boolean().notNull().default(false),
  createdById: uuid()
    .notNull()
    .references((): AnyPgColumn => users.id),
  lastActiveAt: ts(), // 中の何かが最後に変わった日時（28）
  ...timestamps(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole().notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.workspaceId, t.userId), index().on(t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: pk(),
    workspaceId: uuid().references(() => workspaces.id, { onDelete: "cascade" }), // null = ワークスペースなしの招待
    email: text().notNull(),
    role: workspaceRole(),
    grantsAdmin: boolean().notNull().default(false), // 受諾した人を運営者にする。`make admin-create` だけが付ける
    tokenHash: text().notNull().unique(), // SHA-256。トークンそのものは持たない
    invitedById: uuid().references(() => users.id), // null = `make admin-create`（運営者がまだ居ない）
    status: invitationStatus().notNull().default("pending"),
    expiresAt: ts().notNull(), // 発行（再送）から7日
    acceptedById: uuid().references(() => users.id),
    acceptedAt: ts(),
    ...timestamps(),
  },
  (t) => [
    index().on(t.workspaceId),
    index("invitations_email_lower_idx").on(sql`lower(${t.email})`),
    check("invitations_role_required", sql`${t.workspaceId} is null or ${t.role} is not null`),
    check(
      "invitations_admin_without_workspace",
      sql`not ${t.grantsAdmin} or ${t.workspaceId} is null`,
    ),
  ],
);

// ---------- テンプレート ----------
export const templates = pgTable("templates", {
  id: pk(),
  kind: templateKind().notNull().unique(),
  name: text().notNull(),
  ...timestamps(),
});

export const templateVersions = pgTable(
  "template_versions",
  {
    id: pk(),
    templateId: uuid()
      .notNull()
      .references(() => templates.id),
    versionNumber: integer().notNull(),
    status: templateVersionStatus().notNull().default("draft"),
    aiPrompt: text().notNull().default(""),
    publishedAt: ts(),
    publishedById: uuid().references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex().on(t.templateId, t.versionNumber),
    uniqueIndex("template_versions_one_draft_uq")
      .on(t.templateId)
      .where(sql`${t.status} = 'draft'`),
  ],
);

export const templateSections = pgTable(
  "template_sections",
  {
    id: pk(),
    templateVersionId: uuid()
      .notNull()
      .references(() => templateVersions.id, { onDelete: "cascade" }),
    key: text().notNull(), // 例: "WHY"、"01"、プランは "01"〜"30"
    part: planPart(), // プランだけ
    title: text().notNull(),
    guidance: text(),
    sortOrder: integer().notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.templateVersionId, t.key)],
);

export const templateQuestions = pgTable(
  "template_questions",
  {
    id: pk(),
    templateVersionId: uuid()
      .notNull()
      .references(() => templateVersions.id, { onDelete: "cascade" }),
    templateSectionId: uuid()
      .notNull()
      .references(() => templateSections.id, { onDelete: "cascade" }),
    questionKey: text().notNull(), // 設問 ID（design-spec 6.6）。公開後は変えない
    title: text().notNull(),
    prompt: text().notNull(),
    example: text(),
    hint: text(),
    answerType: answerType().notNull(),
    options: jsonb(), // 5.2 QuestionOptions
    displayCondition: jsonb(), // 例: { "V.02.OCEAN": ["Red", "Mixed"] }
    hasFau: boolean().notNull().default(false),
    copyFrom: jsonb(), // プラン: 下書きでコピーする元（設問 ID・IDEA.*・LIST.*）
    reference: jsonb(), // プラン: 参照に出すもの
    sortOrder: integer().notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.templateVersionId, t.questionKey), index().on(t.templateSectionId)],
);

export const templateCostDefaults = pgTable(
  "template_cost_defaults",
  {
    id: pk(),
    templateVersionId: uuid()
      .notNull()
      .references(() => templateVersions.id, { onDelete: "cascade" }),
    category: costCategory().notNull(),
    key: text().notNull(), // 例: "initial.permits"、"monthly.rent"
    name: text().notNull(),
    sortOrder: integer().notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.templateVersionId, t.key)],
);

export const templateCheckRules = pgTable(
  "template_check_rules",
  {
    id: pk(),
    templateVersionId: uuid()
      .notNull()
      .references(() => templateVersions.id, { onDelete: "cascade" }),
    checkKey: checkKey().notNull(),
    params: jsonb().notNull(), // 基準値。例: { "min": 3, "max": 5 }
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.templateVersionId, t.checkKey)],
);

export const templateExecutionPresets = pgTable("template_execution_presets", {
  id: pk(),
  templateVersionId: uuid()
    .notNull()
    .references(() => templateVersions.id, { onDelete: "cascade" }),
  type: presetType().notNull(),
  title: text().notNull(), // 例: "Business decision"、"30 days before launch"、"Revenue"
  area: text(), // KPI だけ（Financial / Customer / Operations）
  launchTiming: launchTiming(), // ローンチだけ
  sortOrder: integer().notNull(),
  ...timestamps(),
});

// ---------- 自己分析 ----------
export const selfAnalyses = pgTable("self_analyses", {
  id: pk(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  templateVersionId: uuid()
    .notNull()
    .references(() => templateVersions.id),
  currency: text().notNull().default("PHP"),
  status: selfAnalysisStatus().notNull().default("not_started"),
  completedAt: ts(),
  ...timestamps(),
});

export const selfAnalysisAnswers = pgTable(
  "self_analysis_answers",
  {
    id: pk(),
    selfAnalysisId: uuid()
      .notNull()
      .references(() => selfAnalyses.id, { onDelete: "cascade" }),
    questionKey: text().notNull(), // 例: "SA.INCOME.1"
    text: text(), // 金額＋理由の設問では理由
    amount: money(), // 金額＋理由の設問だけ
    ...versioned(),
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.selfAnalysisId, t.questionKey)],
);

export const selfAnalysisShares = pgTable(
  "self_analysis_shares",
  {
    id: pk(),
    selfAnalysisId: uuid()
      .notNull()
      .references(() => selfAnalyses.id, { onDelete: "cascade" }),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sharedAt: ts().notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.selfAnalysisId, t.workspaceId), index().on(t.workspaceId)],
);

// ---------- アイデアと検証 ----------
export const ideas = pgTable(
  "ideas",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    oneLineConcept: text().notNull(),
    proposedSolution: text(),
    proposerId: uuid()
      .notNull()
      .references(() => users.id),
    duplicatedFromId: uuid().references((): AnyPgColumn => ideas.id, { onDelete: "set null" }),
    latestDecision: decisionValue(), // null = 未判定。決定ログの最新を写した値
    archivedAt: ts(),
    lastActivityAt: ts().notNull().defaultNow(),
    ...versioned(), // 概要の同時編集
    ...timestamps(),
  },
  (t) => [index().on(t.workspaceId, t.lastActivityAt)],
);
// 工程（stage）は保存しない（プランの有無と Go / No-Go から毎回決める）

export const validations = pgTable("validations", {
  id: pk(),
  ideaId: uuid()
    .notNull()
    .unique()
    .references(() => ideas.id, { onDelete: "cascade" }),
  templateVersionId: uuid()
    .notNull()
    .references(() => templateVersions.id),
  ...timestamps(),
});

const fauColumns = () => ({ fau: fau(), confidence: level() }); // fau = null は未分類か未入力
const fauCheck = (name: string, t: { fau: AnyPgColumn; confidence: AnyPgColumn }) =>
  check(name, sql`(coalesce(${t.fau}::text, '') = 'assumption') = (${t.confidence} is not null)`);

export const validationAnswers = pgTable(
  "validation_answers",
  {
    id: pk(),
    validationId: uuid()
      .notNull()
      .references(() => validations.id, { onDelete: "cascade" }),
    questionKey: text().notNull(), // 例: "V.01.WHO"、"V.08.WORTH"
    text: text(), // 選択の設問は選んだ値
    ...fauColumns(),
    ...versioned(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex().on(t.validationId, t.questionKey),
    fauCheck("validation_answers_confidence", t),
  ],
);

export const researchLogEntries = pgTable(
  "research_log_entries",
  {
    id: pk(),
    validationId: uuid()
      .notNull()
      .references(() => validations.id, { onDelete: "cascade" }),
    observedOn: date({ mode: "string" }),
    topic: text().notNull(),
    observation: text(),
    sourceType: sourceType(),
    sourceUrl: text(),
    supportsChecks: supportsCheck().array().notNull().default(sql`'{}'`), // 裏付ける確認項目
    supportsNote: text(), // What It Supports（自由記述）
    createdById: uuid()
      .notNull()
      .references(() => users.id),
    deletedAt: ts(),
    ...versioned(),
    ...timestamps(),
  },
  (t) => [index().on(t.validationId, t.observedOn)],
);

export const competitors = pgTable(
  "competitors",
  {
    id: pk(),
    validationId: uuid()
      .notNull()
      .references(() => validations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    type: competitorType(),
    targetCustomer: text(),
    offering: text(),
    typicalPrice: money(),
    priceNote: text(), // 例: "per box"
    strength: text(),
    weakness: text(),
    whyChosen: text(),
    whySurvive: text(),
    sortOrder: integer().notNull(),
    deletedAt: ts(),
    ...versioned(),
    ...timestamps(),
  },
  (t) => [index().on(t.validationId)],
);

export const assumptions = pgTable(
  "assumptions",
  {
    id: pk(),
    validationId: uuid()
      .notNull()
      .references(() => validations.id, { onDelete: "cascade" }),
    statement: text().notNull(),
    whyBelieve: text(),
    evidenceNote: text(), // 根拠（evidence_links）とは別の自由記述
    confidence: level(),
    disproveCondition: text(),
    nextCheck: text(),
    sortOrder: integer().notNull(),
    deletedAt: ts(),
    ...versioned(),
    ...timestamps(),
  },
  (t) => [index().on(t.validationId)],
);

export const risks = pgTable(
  "risks",
  {
    id: pk(),
    validationId: uuid()
      .notNull()
      .references(() => validations.id, { onDelete: "cascade" }),
    statement: text().notNull(),
    probability: level(),
    impact: level(),
    whyMatters: text(),
    mitigation: text(),
    howToValidate: text(),
    sortOrder: integer(), // null = 自動の並び（Impact → Probability の高い順）
    deletedAt: ts(),
    ...versioned(),
    ...timestamps(),
  },
  (t) => [index().on(t.validationId)],
);

export const costItems = pgTable(
  "cost_items",
  {
    id: pk(),
    validationId: uuid()
      .notNull()
      .references(() => validations.id, { onDelete: "cascade" }),
    category: costCategory().notNull(),
    templateKey: text(), // テンプレートの初期行のキー。追加した行は null
    name: text().notNull(),
    inputMode: costInputMode().notNull().default("amount"),
    amount: money(),
    percent: ratio(), // 0〜1
    isLumpSum: boolean().notNull().default(false),
    whyNeeded: text(), // initial
    canReduce: canReduce(), // initial
    notes: text(),
    ...fauColumns(),
    sortOrder: integer().notNull(),
    deletedAt: ts(),
    ...versioned(),
    ...timestamps(),
  },
  (t) => [
    index().on(t.validationId, t.category),
    fauCheck("cost_items_confidence", t),
    check(
      "cost_items_percent_variable",
      sql`${t.inputMode} = 'amount' or ${t.category} = 'variable'`,
    ),
    check(
      "cost_items_unknown_no_value",
      sql`coalesce(${t.fau}::text, '') <> 'unknown' or (${t.amount} is null and ${t.percent} is null)`,
    ),
    check(
      "cost_items_ranges",
      sql`(${t.amount} is null or ${t.amount} >= 0) and (${t.percent} is null or (${t.percent} >= 0 and ${t.percent} <= 1))`,
    ),
  ],
);

export const economicsInputs = pgTable(
  "economics_inputs",
  {
    id: pk(),
    validationId: uuid()
      .notNull()
      .references(() => validations.id, { onDelete: "cascade" }),
    fieldKey: economicsField().notNull(),
    value: numeric({ precision: 17, scale: 4, mode: "number" }), // null = 未入力。target_margin は 0.15 = 15%
    ...fauColumns(),
    ...versioned(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex().on(t.validationId, t.fieldKey),
    fauCheck("economics_inputs_confidence", t),
    check(
      "economics_inputs_unknown_no_value",
      sql`coalesce(${t.fau}::text, '') <> 'unknown' or ${t.value} is null`,
    ),
  ],
);

export const evidenceLinks = pgTable(
  "evidence_links",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    validationId: uuid()
      .notNull()
      .references(() => validations.id, { onDelete: "cascade" }),
    targetType: evidenceTargetType().notNull(),
    targetId: uuid().notNull(), // 回答・数字は検証の id、行は行の id（5.1 TargetRef）
    targetKey: text(), // 回答は設問 ID、数字は field_key
    researchLogEntryId: uuid().references(() => researchLogEntries.id),
    url: text(),
    note: text(),
    createdById: uuid()
      .notNull()
      .references(() => users.id),
    deletedAt: ts(), // 根拠を外したとき（履歴から戻せる）
    ...timestamps(),
  },
  (t) => [
    index().on(t.targetType, t.targetId, t.targetKey),
    index().on(t.researchLogEntryId),
    check(
      "evidence_links_one_source",
      sql`(${t.researchLogEntryId} is not null) <> (${t.url} is not null)`,
    ),
  ],
);

// ---------- プランと実行管理 ----------
export const businessPlans = pgTable(
  "business_plans",
  {
    id: pk(),
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    name: text().notNull(), // 案の名前（Plan A など）
    businessName: text().notNull(),
    preparedBy: text().notNull(),
    templateVersionId: uuid()
      .notNull()
      .references(() => templateVersions.id),
    createdFromDecisionId: uuid().references((): AnyPgColumn => decisionLogEntries.id),
    archivedAt: ts(),
    lastActivityAt: ts().notNull().defaultNow(),
    createdById: uuid()
      .notNull()
      .references(() => users.id),
    ...versioned(), // ヘッダの同時編集
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.ideaId, t.name)],
);

export const planAnswers = pgTable(
  "plan_answers",
  {
    id: pk(),
    businessPlanId: uuid()
      .notNull()
      .references(() => businessPlans.id, { onDelete: "cascade" }),
    questionKey: text().notNull(), // 例: "P.01.1"
    text: text(),
    rows: jsonb(), // 表の小項目（§11・§13・§21・§22）の行の配列
    copiedFrom: jsonb(), // { source, copiedAt }
    ...versioned(),
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.businessPlanId, t.questionKey)],
);

export const planVersions = pgTable(
  "plan_versions",
  {
    id: pk(),
    businessPlanId: uuid()
      .notNull()
      .references(() => businessPlans.id, { onDelete: "cascade" }),
    versionNumber: integer().notNull(),
    name: text().notNull(), // 例: "v1 For advisors"
    snapshot: jsonb().notNull(), // 30項目の回答・主要指標・シナリオ表・実行管理の項目・競合の上位5件
    savedById: uuid()
      .notNull()
      .references(() => users.id),
    savedAt: ts().notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.businessPlanId, t.versionNumber)],
);

export const executionItems = pgTable(
  "execution_items",
  {
    id: pk(),
    businessPlanId: uuid()
      .notNull()
      .references(() => businessPlans.id, { onDelete: "cascade" }),
    type: executionType().notNull(),
    title: text().notNull(), // Milestone / Timing / KPI / Open Question / Action の文言
    assigneeUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    assigneeName: text(), // 担当を自由に書いたとき
    dueDate: date({ mode: "string" }),
    status: executionStatus(), // 種類ごとに使う値が決まる。KPI は null
    goal: text(), // milestone
    exitCondition: text(), // milestone
    launchTiming: launchTiming(), // launch
    actions: text(), // launch
    completionCriteria: text(), // launch
    kpiArea: text(), // kpi
    kpiTarget: text(), // kpi（原本どおり文章）
    kpiReviewFrequency: text(), // kpi
    kpiActual: text(), // kpi（アプリで足した実績）
    kpiActualUpdatedAt: ts(),
    whyItMatters: text(), // open_question
    answer: text(), // open_question
    fromPreset: boolean().notNull().default(false),
    completedAt: ts(),
    sortOrder: integer().notNull(),
    deletedAt: ts(),
    ...versioned(),
    ...timestamps(),
  },
  (t) => [
    index().on(t.businessPlanId, t.type),
    index("execution_items_due_idx")
      .on(t.dueDate)
      .where(sql`${t.dueDate} is not null and ${t.deletedAt} is null`),
    check(
      "execution_items_one_assignee",
      sql`${t.assigneeUserId} is null or ${t.assigneeName} is null`,
    ),
  ],
);

// ---------- 決定ログ・コメント・通知・変更履歴 ----------
export const decisionLogEntries = pgTable(
  "decision_log_entries",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    businessPlanId: uuid().references((): AnyPgColumn => businessPlans.id, { onDelete: "cascade" }),
    planVersionId: uuid().references(() => planVersions.id),
    kind: decisionKind().notNull(),
    value: decisionLogValue(), // version_saved は null
    reason: text(), // 判定と Go / No-Go は必須（API で検査）
    snapshot: jsonb().notNull(), // 不足項目・主要指標・F/A/U の内訳（Go / No-Go は §24 の条件も）
    recordedById: uuid()
      .notNull()
      .references(() => users.id),
    recordedAt: ts().notNull().defaultNow(),
    createdAt: ts().notNull().defaultNow(), // 追記だけ（updatedAt を持たない）
  },
  (t) => [
    index().on(t.workspaceId, t.recordedAt),
    index().on(t.ideaId, t.recordedAt),
    index().on(t.businessPlanId),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }), // 自己分析へのコメントは共有先
    targetType: commentTargetType().notNull(),
    targetId: uuid().notNull(),
    targetKey: text(),
    parentId: uuid().references((): AnyPgColumn => comments.id, { onDelete: "cascade" }), // 返信（1段まで）
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    body: text().notNull(),
    resolvedAt: ts(),
    resolvedById: uuid().references(() => users.id),
    editedAt: ts(),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [
    index().on(t.targetType, t.targetId, t.targetKey),
    index().on(t.workspaceId, t.createdAt),
  ],
);

export const commentMentions = pgTable(
  "comment_mentions",
  {
    id: pk(),
    commentId: uuid()
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.commentId, t.userId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // 受け取る人
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: notificationKind().notNull(),
    actorId: uuid().references(() => users.id),
    commentId: uuid().references(() => comments.id, { onDelete: "cascade" }),
    decisionLogEntryId: uuid().references(() => decisionLogEntries.id, { onDelete: "cascade" }),
    link: jsonb().notNull(), // 開く先（5.2 LinkTarget）
    readAt: ts(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    index("notifications_unread_idx").on(t.userId).where(sql`${t.readAt} is null`),
  ],
);

export const changeHistory = pgTable(
  "change_history",
  {
    id: pk(),
    workspaceId: uuid().references(() => workspaces.id, { onDelete: "cascade" }), // 自己分析の履歴は null
    ownerUserId: uuid().references(() => users.id, { onDelete: "cascade" }), // 自己分析の履歴の持ち主
    containerType: historyContainer().notNull(), // 画面全体の履歴を引くため
    containerId: uuid().notNull(),
    sectionKey: text(), // 例: "01"、"costs"、"economics"、プランは項目番号
    targetType: text().notNull(), // 5.1 TargetRef の type
    targetId: uuid().notNull(),
    targetKey: text(),
    action: historyAction().notNull(),
    before: jsonb(),
    after: jsonb(),
    source: historySource().notNull(),
    batchId: uuid(), // 1回の操作（AI 取り込み・移行・下書き作成・複製）のまとまり
    client: clientKind().notNull().default("unknown"),
    revertedFromId: uuid().references((): AnyPgColumn => changeHistory.id),
    changedById: uuid()
      .notNull()
      .references(() => users.id),
    changedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.targetType, t.targetId, t.targetKey, t.changedAt),
    index().on(t.containerType, t.containerId, t.changedAt),
    index().on(t.workspaceId, t.changedAt),
    index().on(t.batchId),
  ],
);
