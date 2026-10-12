// The data model of SDD 6.3, which is the source: change both together. schema.test.ts
// checks that the code here matches the code there, comments and formatting aside.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
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

// ---------- Shared columns ----------
const pk = () => uuid().primaryKey().defaultRandom();
const ts = () => timestamp({ withTimezone: true });
// The repository functions set updated_at only when the content changes. No $onUpdate:
// updates that are not content changes, such as reordering (V17, P11) and archiving (I4),
// leave it alone.
const timestamps = () => ({
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});
// Rows edited under the optimistic lock (ADR-019)
const versioned = () => ({
  lockVersion: integer().notNull().default(0),
  updatedById: uuid().references((): AnyPgColumn => users.id, {
    onDelete: "set null",
  }),
});
// Money. The API checks the limit and the two decimal places (design-spec 6.0.8). This type
// holds more than the limit, so too large a value fails with 422 before it can overflow.
const money = () => numeric({ precision: 15, scale: 2, mode: "number" });
// A rate: 0.3500 = 35%. Percentages are entered with two decimal places (design-spec 6.0.8),
// so four places hold any rate without rounding.
const ratio = () => numeric({ precision: 7, scale: 4, mode: "number" });
// Two kinds of constraints and indexes get explicit names below:
// - Those whose generated names would pass PostgreSQL's 63-byte limit: PostgreSQL would
//   cut such a name short, and the database would no longer match the snapshot drizzle-kit
//   keeps. Foreign keys get their names through foreignKey().
// - unique() on columns of more than one word: drizzle-orm names it from the column name
//   before snake_case, as in invitations_tokenHash_unique, so the database name would mix
//   in capitals unlike every other name.

// ---------- enum ----------
export const userStatus = pgEnum("user_status", [
  "active",
  "suspended",
  "deleted",
]);
export const themePref = pgEnum("theme_pref", ["system", "light", "dark"]);
export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "member",
  "viewer",
]);
// Expiry is not stored: the API reports a pending invitation past expires_at as "expired" (W4 GET)
export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
]);
export const templateKind = pgEnum("template_kind", [
  "self_analysis",
  "validation",
  "business_plan",
]);
export const templateVersionStatus = pgEnum("template_version_status", [
  "draft",
  "published",
]);
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
export const costCategory = pgEnum("cost_category", [
  "initial",
  "monthly_fixed",
  "variable",
]);
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
export const decisionValue = pgEnum("decision_value", [
  "proceed",
  "hold",
  "drop",
]);
export const fau = pgEnum("fau", ["fact", "assumption", "unknown"]);
export const level = pgEnum("level", ["low", "medium", "high"]); // Confidence, probability and impact
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
export const supportsCheck = pgEnum("supports_check", [
  "local_price",
  "permits",
  "demand_signal",
]);
export const competitorType = pgEnum("competitor_type", [
  "direct",
  "indirect",
  "substitute",
]);
export const canReduce = pgEnum("can_reduce", ["yes", "partly", "no"]);
export const costInputMode = pgEnum("cost_input_mode", [
  "amount",
  "percent_of_price",
]);
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
export const notificationKind = pgEnum("notification_kind", [
  "mention",
  "comment",
  "decision",
]);
export const historyAction = pgEnum("history_action", [
  "create",
  "update",
  "delete",
  "restore",
]);
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
]); // One screen's data. Used by change_history and comments
export const clientKind = pgEnum("client_kind", [
  "web",
  "web_mobile",
  "unknown",
]); // SDD 5.1「クライアントの種類」. The native app feature adds ios and android

// ---------- Auth (Better Auth; its config maps its field names to these columns) ----------
export const users = pgTable(
  "users",
  {
    id: pk(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    displayName: text().notNull(), // Better Auth's name
    avatarUrl: text(), // Better Auth's image
    isAdmin: boolean().notNull().default(false),
    status: userStatus().notNull().default("active"),
    theme: themePref().notNull().default("system"),
    timezone: text().notNull().default("Asia/Manila"), // IANA name, taken from the device at sign-up
    lastWorkspaceId: uuid().references((): AnyPgColumn => workspaces.id, {
      onDelete: "set null",
    }),
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
    accountId: text().notNull(), // The provider's ID
    providerId: text().notNull(), // "credential" | "google"
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: ts(),
    refreshTokenExpiresAt: ts(),
    scope: text(),
    password: text(), // A hash, for credential accounts only
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
  // Shared by Better Auth and the API's entry plugin, whose keys start with `app:` (ADR-029)
  id: pk(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

// ---------- Workspaces ----------
export const workspaces = pgTable("workspaces", {
  id: pk(),
  name: text().notNull(),
  currency: text().notNull().default("PHP"), // ISO 4217
  isPersonal: boolean().notNull().default(false),
  createdById: uuid()
    .notNull()
    .references((): AnyPgColumn => users.id),
  lastActiveAt: ts(), // When anything inside last changed (screen 28)
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
    workspaceId: uuid().references(() => workspaces.id, {
      onDelete: "cascade",
    }), // null = an invitation without a workspace
    email: text().notNull(),
    role: workspaceRole(),
    grantsAdmin: boolean().notNull().default(false), // true = whoever accepts becomes an operator. Only `make admin-create` sets it, and only without a workspace
    tokenHash: text().notNull().unique("invitations_token_hash_unique"), // SHA-256. The token itself is never stored
    invitedById: uuid().references(() => users.id), // null = issued by `make admin-create` (no operator exists yet)
    status: invitationStatus().notNull().default("pending"),
    expiresAt: ts().notNull(), // Counted from the issue (or resend). The length is in design-spec 6.16
    acceptedById: uuid().references(() => users.id),
    acceptedAt: ts(),
    ...timestamps(),
  },
  (t) => [
    index().on(t.workspaceId),
    index("invitations_email_lower_idx").on(sql`lower(${t.email})`),
    check(
      "invitations_role_required",
      sql`${t.workspaceId} is null or ${t.role} is not null`,
    ),
    check(
      "invitations_admin_without_workspace",
      sql`not ${t.grantsAdmin} or ${t.workspaceId} is null`,
    ),
  ],
);

// ---------- Templates ----------
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
    key: text().notNull(), // e.g. "WHY", "01"; plans use "01" to "30"
    part: planPart(), // Plans only
    title: text().notNull(),
    subtitle: text(), // The short rewording next to the heading (the self-analysis "Why do I want this?")
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
    questionKey: text().notNull(), // The question ID (design-spec 6.6). Never changes once published
    title: text().notNull(),
    prompt: text().notNull(),
    example: text(),
    hint: text(),
    answerType: answerType().notNull(),
    options: jsonb(), // SDD 5.2 QuestionOptions
    displayCondition: jsonb(), // e.g. { "V.02.OCEAN": ["Red", "Mixed"] }
    hasFau: boolean().notNull().default(false),
    copyFrom: jsonb(), // Plans: what the draft copies (an array of strings, shaped as at the end of SDD 6.3)
    reference: jsonb(), // Plans: what the reference shows (shaped as at the end of SDD 6.3)
    sortOrder: integer().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex().on(t.templateVersionId, t.questionKey),
    index().on(t.templateSectionId),
  ],
);

export const templateCostDefaults = pgTable(
  "template_cost_defaults",
  {
    id: pk(),
    templateVersionId: uuid().notNull(), // Foreign key at the end, named to fit 63 bytes
    category: costCategory().notNull(),
    key: text().notNull(), // e.g. "initial.permits", "monthly.rent"
    name: text().notNull(),
    sortOrder: integer().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex().on(t.templateVersionId, t.key),
    foreignKey({
      name: "template_cost_defaults_template_version_id_fk",
      columns: [t.templateVersionId],
      foreignColumns: [templateVersions.id],
    }).onDelete("cascade"),
  ],
);

export const templateCheckRules = pgTable(
  "template_check_rules",
  {
    id: pk(),
    templateVersionId: uuid().notNull(), // Foreign key at the end, named to fit 63 bytes
    checkKey: checkKey().notNull(),
    params: jsonb().notNull(), // Thresholds, e.g. { "min": 3 } for competitors (the suggested maximum of 5 is not stored; SDD 5.2 CheckResult)
    ...timestamps(),
  },
  (t) => [
    uniqueIndex().on(t.templateVersionId, t.checkKey),
    foreignKey({
      name: "template_check_rules_template_version_id_fk",
      columns: [t.templateVersionId],
      foreignColumns: [templateVersions.id],
    }).onDelete("cascade"),
  ],
);

export const templateExecutionPresets = pgTable(
  "template_execution_presets",
  {
    id: pk(),
    templateVersionId: uuid().notNull(), // Foreign key at the end, named to fit 63 bytes
    type: presetType().notNull(),
    title: text().notNull(), // e.g. "Business decision", "30 days before launch", "Revenue"
    area: text(), // KPIs only (Financial / Customer / Operations)
    launchTiming: launchTiming(), // Launch items only
    sortOrder: integer().notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "template_execution_presets_template_version_id_fk",
      columns: [t.templateVersionId],
      foreignColumns: [templateVersions.id],
    }).onDelete("cascade"),
  ],
);

// ---------- Self-analysis ----------
export const selfAnalyses = pgTable("self_analyses", {
  id: pk(),
  userId: uuid()
    .notNull()
    .unique("self_analyses_user_id_unique")
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
    questionKey: text().notNull(), // e.g. "SA.INCOME.1"
    text: text(), // The reason, for amount-with-reason questions
    amount: money(), // Amount-with-reason questions only
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
  (t) => [
    uniqueIndex().on(t.selfAnalysisId, t.workspaceId),
    index().on(t.workspaceId),
  ],
);

// ---------- Ideas and validation ----------
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
    duplicatedFromId: uuid().references((): AnyPgColumn => ideas.id, {
      onDelete: "set null",
    }),
    latestDecision: decisionValue(), // null = not decided yet. A copy of the latest decision log entry's value
    archivedAt: ts(),
    deletedAt: ts(), // Set only by undoing the creation (SDD 5.11). Never restored
    lastActivityAt: ts().notNull().defaultNow(),
    ...versioned(), // Concurrent edits of the overview
    ...timestamps(),
  },
  (t) => [index().on(t.workspaceId, t.lastActivityAt)],
);
// The stage is not stored: it is worked out each time from the plans and their Go / No-Go

export const validations = pgTable("validations", {
  id: pk(),
  ideaId: uuid()
    .notNull()
    .unique("validations_idea_id_unique")
    .references(() => ideas.id, { onDelete: "cascade" }),
  templateVersionId: uuid()
    .notNull()
    .references(() => templateVersions.id),
  ...timestamps(),
});

const fauColumns = () => ({ fau: fau(), confidence: level() }); // fau = null: not classified, or nothing entered
const fauCheck = (
  name: string,
  t: { fau: AnyPgColumn; confidence: AnyPgColumn },
) =>
  check(
    name,
    sql`(coalesce(${t.fau}::text, '') = 'assumption') = (${t.confidence} is not null)`,
  );

export const validationAnswers = pgTable(
  "validation_answers",
  {
    id: pk(),
    validationId: uuid()
      .notNull()
      .references(() => validations.id, { onDelete: "cascade" }),
    questionKey: text().notNull(), // e.g. "V.01.WHO", "V.08.WORTH"
    text: text(), // For choice questions, the chosen value
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
    supportsChecks: supportsCheck().array().notNull().default(sql`'{}'`), // The checks this entry supports
    supportsNote: text(), // What It Supports (free text)
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
    priceNote: text(), // e.g. "per box"
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
    evidenceNote: text(), // Free text, apart from the evidence in evidence_links
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
    sortOrder: integer(), // null = automatic order (highest Impact, then Probability, first)
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
    templateKey: text(), // Key of the template's starting row. null for rows the user added
    name: text().notNull(),
    inputMode: costInputMode().notNull().default("amount"),
    amount: money(),
    percent: ratio(), // 0 to 1
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
    value: numeric({ precision: 17, scale: 4, mode: "number" }), // null = not entered. target_margin 0.15 = 15%. Prices and unit counts have two decimal places (design-spec 6.0.8)
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
    targetId: uuid().notNull(), // The validation's id for answers and numbers, the row's id for rows (SDD 5.1 TargetRef)
    targetKey: text(), // The question ID for answers, the field_key for numbers
    researchLogEntryId: uuid().references(() => researchLogEntries.id),
    url: text(),
    note: text(),
    createdById: uuid()
      .notNull()
      .references(() => users.id),
    deletedAt: ts(), // Set when the evidence is detached (the history can restore it)
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

// ---------- Plans and execution ----------
export const businessPlans = pgTable(
  "business_plans",
  {
    id: pk(),
    ideaId: uuid()
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    name: text().notNull(), // The option's name, such as Plan A
    businessName: text().notNull(),
    preparedBy: text().notNull(),
    templateVersionId: uuid()
      .notNull()
      .references(() => templateVersions.id),
    createdFromDecisionId: uuid(), // Foreign key at the end, named to fit 63 bytes
    archivedAt: ts(),
    deletedAt: ts(), // Set only by undoing the creation (SDD 5.11). Never restored
    lastActivityAt: ts().notNull().defaultNow(),
    createdById: uuid()
      .notNull()
      .references(() => users.id),
    ...versioned(), // Concurrent edits of the header
    ...timestamps(),
  },
  (t) => [
    // Plans whose creation was undone are left out, so a name nobody can see never collides (design-spec 6.0.8)
    uniqueIndex("business_plans_name_uq")
      .on(t.ideaId, t.name)
      .where(sql`${t.deletedAt} is null`),
    foreignKey({
      name: "business_plans_created_from_decision_id_fk",
      columns: [t.createdFromDecisionId],
      foreignColumns: [decisionLogEntries.id],
    }),
  ],
);

export const planAnswers = pgTable(
  "plan_answers",
  {
    id: pk(),
    businessPlanId: uuid()
      .notNull()
      .references(() => businessPlans.id, { onDelete: "cascade" }),
    questionKey: text().notNull(), // e.g. "P.01.1"
    text: text(),
    rows: jsonb(), // The rows of a table sub-item (§11, §13, §21, §22)
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
    name: text().notNull(), // e.g. "v1 For advisors"
    snapshot: jsonb().notNull(), // Shaped as at the end of SDD 6.3
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
    title: text().notNull(), // The Milestone / Timing / KPI / Open Question / Action text
    assigneeUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    assigneeName: text(), // When the assignee is written in freely
    dueDate: date({ mode: "string" }),
    status: executionStatus(), // Each type has its own values. null for KPIs
    goal: text(), // milestone
    exitCondition: text(), // milestone
    launchTiming: launchTiming(), // launch
    actions: text(), // launch
    completionCriteria: text(), // launch
    kpiArea: text(), // kpi
    kpiTarget: text(), // kpi (free text, as in the original)
    kpiReviewFrequency: text(), // kpi
    kpiActual: text(), // kpi (the actual result; a field the app adds to the original)
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

// ---------- Decision log, comments, notifications, change history ----------
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
    businessPlanId: uuid().references((): AnyPgColumn => businessPlans.id, {
      onDelete: "cascade",
    }),
    planVersionId: uuid().references((): AnyPgColumn => planVersions.id),
    kind: decisionKind().notNull(),
    value: decisionLogValue(), // null for version_saved
    reason: text(), // Required for decisions and Go / No-Go (the API checks)
    snapshot: jsonb().notNull(), // Missing items, key metrics and the F/A/U breakdown (and the §24 conditions for Go / No-Go)
    recordedById: uuid()
      .notNull()
      .references(() => users.id),
    recordedAt: ts().notNull().defaultNow(),
    createdAt: ts().notNull().defaultNow(), // Append-only, so no updatedAt
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
      .references(() => workspaces.id, { onDelete: "cascade" }), // For a comment on a self-analysis, the workspace it is shared with
    containerType: historyContainer().notNull(), // To list a screen's comments (C1 by screen). Worked out from the target
    containerId: uuid().notNull(),
    sectionKey: text(), // Same values as change_history.section_key (SDD 6.3「画面と節の対応」)
    targetType: commentTargetType().notNull(),
    targetId: uuid().notNull(),
    targetKey: text(),
    parentId: uuid().references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }), // Replies, one level deep
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
    index().on(t.containerType, t.containerId, t.sectionKey),
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
      .references(() => users.id, { onDelete: "cascade" }), // The recipient
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: notificationKind().notNull(),
    actorId: uuid().references(() => users.id),
    commentId: uuid().references(() => comments.id, { onDelete: "cascade" }),
    decisionLogEntryId: uuid().references(() => decisionLogEntries.id, {
      onDelete: "cascade",
    }),
    link: jsonb().notNull(), // Where it opens (SDD 5.2 LinkTarget)
    readAt: ts(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    index("notifications_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
  ],
);

export const changeHistory = pgTable(
  "change_history",
  {
    id: pk(),
    workspaceId: uuid().references(() => workspaces.id, {
      onDelete: "cascade",
    }), // null for self-analysis history
    ownerUserId: uuid().references(() => users.id, { onDelete: "cascade" }), // The owner of self-analysis history
    containerType: historyContainer().notNull(), // To list a whole screen's history
    containerId: uuid().notNull(),
    sectionKey: text(), // Values per screen: SDD 6.3「画面と節の対応」
    targetType: text().notNull(), // The type of SDD 5.1 TargetRef
    targetId: uuid().notNull(),
    targetKey: text(),
    action: historyAction().notNull(),
    before: jsonb(),
    after: jsonb(),
    source: historySource().notNull(),
    batchId: uuid(), // Groups one operation (AI import, migration, plan draft, duplication, or undoing one of these)
    client: clientKind().notNull().default("unknown"), // Screen width at save time (SDD 5.1「クライアントの種類」; K-08, K-16)
    revertedFromId: uuid().references((): AnyPgColumn => changeHistory.id),
    changedById: uuid()
      .notNull()
      .references(() => users.id),
    changedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index("change_history_target_idx").on(
      t.targetType,
      t.targetId,
      t.targetKey,
      t.changedAt,
    ),
    index().on(t.containerType, t.containerId, t.changedAt),
    index().on(t.workspaceId, t.changedAt),
    index().on(t.batchId),
  ],
);
