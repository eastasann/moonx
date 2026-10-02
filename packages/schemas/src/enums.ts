import { z } from "zod";

/** Enumerations shared by the API, the clients and the DB (SDD 5.2). */
export const roleSchema = z.enum(["owner", "member", "viewer"]);
export const fauSchema = z.enum(["fact", "assumption", "unknown"]);
export const fauStateSchema = z.enum([
  "empty",
  "unclassified",
  "fact",
  "fact_no_evidence",
  "assumption",
  "unknown",
]);
export const confidenceSchema = z.enum(["low", "medium", "high"]);
export const decisionValueSchema = z.enum(["proceed", "hold", "drop"]);
export const goNoGoValueSchema = z.enum(["launch", "delay", "stop"]);
export const stageSchema = z.enum(["validation", "planning", "launch_prep"]);
export const checkKeySchema = z.enum([
  "competitors",
  "local_price",
  "costs",
  "break_even",
  "permits",
  "demand_signal",
]);
export const checkStateSchema = z.enum(["not_started", "partial", "done"]);
export const supportsCheckSchema = z.enum(["local_price", "permits", "demand_signal"]);
export const sourceTypeSchema = z.enum([
  "google_maps_reviews",
  "website",
  "social_media",
  "public_data",
  "news_report",
  "store_observation",
  "price_check",
  "other",
]);
export const costCategorySchema = z.enum(["initial", "monthly_fixed", "variable"]);
export const economicsFieldSchema = z.enum([
  "selling_price",
  "operating_days",
  "target_margin",
  "units_conservative",
  "units_expected",
  "units_strong",
  "units_capacity",
]);
export const executionTypeSchema = z.enum([
  "milestone",
  "launch",
  "kpi",
  "open_question",
  "next_action",
]);
export const executionStatusSchema = z.enum(["todo", "doing", "done", "open", "resolved"]);
export const launchTimingSchema = z.enum([
  "t_minus_30",
  "t_minus_7",
  "launch_day",
  "first_30",
  "days_31_90",
  "other",
]);
export const templateKindSchema = z.enum(["self_analysis", "validation", "business_plan"]);
export const answerTypeSchema = z.enum([
  "long_text",
  "short_text",
  "choice",
  "amount_with_reason",
  "table",
  "linked_metric",
  "execution_view",
]);
export const historySourceSchema = z.enum([
  "manual",
  "ai_import",
  "revert",
  "template_migration",
  "duplicate",
  "plan_draft",
]);
export const targetTypeSchema = z.enum([
  "self_analysis_answer",
  "validation_answer",
  "economics_input",
  "plan_answer",
  "pitch_slide",
  "idea",
  "research_log_entry",
  "competitor",
  "assumption",
  "risk",
  "cost_item",
  "execution_item",
  "business_plan",
  "template_version",
]);

export type Role = z.infer<typeof roleSchema>;
export type Fau = z.infer<typeof fauSchema>;
export type FauState = z.infer<typeof fauStateSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type DecisionValue = z.infer<typeof decisionValueSchema>;
export type GoNoGoValue = z.infer<typeof goNoGoValueSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type CheckKey = z.infer<typeof checkKeySchema>;
export type CheckState = z.infer<typeof checkStateSchema>;
export type SupportsCheck = z.infer<typeof supportsCheckSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;
export type CostCategory = z.infer<typeof costCategorySchema>;
export type EconomicsField = z.infer<typeof economicsFieldSchema>;
export type ExecutionType = z.infer<typeof executionTypeSchema>;
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
export type LaunchTiming = z.infer<typeof launchTimingSchema>;
export type TemplateKind = z.infer<typeof templateKindSchema>;
export type AnswerType = z.infer<typeof answerTypeSchema>;
export type HistorySource = z.infer<typeof historySourceSchema>;
export type TargetType = z.infer<typeof targetTypeSchema>;
