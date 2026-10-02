CREATE TYPE "public"."answer_type" AS ENUM('long_text', 'short_text', 'choice', 'amount_with_reason', 'table', 'linked_metric', 'execution_view');--> statement-breakpoint
CREATE TYPE "public"."can_reduce" AS ENUM('yes', 'partly', 'no');--> statement-breakpoint
CREATE TYPE "public"."check_key" AS ENUM('competitors', 'local_price', 'costs', 'break_even', 'permits', 'demand_signal');--> statement-breakpoint
CREATE TYPE "public"."client_kind" AS ENUM('web', 'ios', 'android', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."comment_target_type" AS ENUM('self_analysis_answer', 'validation_answer', 'research_log_entry', 'competitor', 'assumption', 'risk', 'cost_item', 'economics_input', 'plan_answer', 'execution_item', 'pitch_slide', 'idea');--> statement-breakpoint
CREATE TYPE "public"."competitor_type" AS ENUM('direct', 'indirect', 'substitute');--> statement-breakpoint
CREATE TYPE "public"."cost_category" AS ENUM('initial', 'monthly_fixed', 'variable');--> statement-breakpoint
CREATE TYPE "public"."cost_input_mode" AS ENUM('amount', 'percent_of_price');--> statement-breakpoint
CREATE TYPE "public"."decision_kind" AS ENUM('validation_decision', 'go_no_go', 'version_saved');--> statement-breakpoint
CREATE TYPE "public"."decision_log_value" AS ENUM('proceed', 'hold', 'drop', 'launch', 'delay', 'stop');--> statement-breakpoint
CREATE TYPE "public"."decision_value" AS ENUM('proceed', 'hold', 'drop');--> statement-breakpoint
CREATE TYPE "public"."due_stage" AS ENUM('three_days_before', 'due_day', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."economics_field" AS ENUM('selling_price', 'operating_days', 'target_margin', 'units_conservative', 'units_expected', 'units_strong', 'units_capacity');--> statement-breakpoint
CREATE TYPE "public"."evidence_target_type" AS ENUM('validation_answer', 'cost_item', 'economics_input', 'competitor', 'assumption');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('todo', 'doing', 'done', 'open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."execution_type" AS ENUM('milestone', 'launch', 'kpi', 'open_question', 'next_action');--> statement-breakpoint
CREATE TYPE "public"."fau" AS ENUM('fact', 'assumption', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."history_action" AS ENUM('create', 'update', 'delete', 'restore');--> statement-breakpoint
CREATE TYPE "public"."history_container" AS ENUM('self_analysis', 'validation', 'business_plan', 'idea');--> statement-breakpoint
CREATE TYPE "public"."history_source" AS ENUM('manual', 'ai_import', 'revert', 'template_migration', 'duplicate', 'plan_draft');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."launch_timing" AS ENUM('t_minus_30', 't_minus_7', 'launch_day', 'first_30', 'days_31_90', 'other');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('mention', 'comment', 'decision', 'due');--> statement-breakpoint
CREATE TYPE "public"."plan_part" AS ENUM('a', 'b');--> statement-breakpoint
CREATE TYPE "public"."preset_type" AS ENUM('milestone', 'launch', 'kpi');--> statement-breakpoint
CREATE TYPE "public"."self_analysis_status" AS ENUM('not_started', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('google_maps_reviews', 'website', 'social_media', 'public_data', 'news_report', 'store_observation', 'price_check', 'other');--> statement-breakpoint
CREATE TYPE "public"."supports_check" AS ENUM('local_price', 'permits', 'demand_signal');--> statement-breakpoint
CREATE TYPE "public"."template_kind" AS ENUM('self_analysis', 'validation', 'business_plan');--> statement-breakpoint
CREATE TYPE "public"."template_version_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."theme_pref" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'member', 'viewer');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"why_believe" text,
	"evidence_note" text,
	"confidence" "level",
	"disprove_condition" text,
	"next_check" text,
	"sort_order" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"name" text NOT NULL,
	"business_name" text NOT NULL,
	"prepared_by" text NOT NULL,
	"template_version_id" uuid NOT NULL,
	"created_from_decision_id" uuid,
	"archived_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"owner_user_id" uuid,
	"container_type" "history_container" NOT NULL,
	"container_id" uuid NOT NULL,
	"section_key" text,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"target_key" text,
	"action" "history_action" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"source" "history_source" NOT NULL,
	"batch_id" uuid,
	"client" "client_kind" DEFAULT 'unknown' NOT NULL,
	"reverted_from_id" uuid,
	"changed_by_id" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_type" "comment_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"target_key" text,
	"parent_id" uuid,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" uuid,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "competitor_type",
	"target_customer" text,
	"offering" text,
	"typical_price" numeric(14, 2),
	"price_note" text,
	"strength" text,
	"weakness" text,
	"why_chosen" text,
	"why_survive" text,
	"sort_order" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_id" uuid NOT NULL,
	"category" "cost_category" NOT NULL,
	"template_key" text,
	"name" text NOT NULL,
	"input_mode" "cost_input_mode" DEFAULT 'amount' NOT NULL,
	"amount" numeric(14, 2),
	"percent" numeric(7, 4),
	"is_lump_sum" boolean DEFAULT false NOT NULL,
	"why_needed" text,
	"can_reduce" "can_reduce",
	"notes" text,
	"fau" "fau",
	"confidence" "level",
	"sort_order" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_items_confidence" CHECK ((coalesce("cost_items"."fau"::text, '') = 'assumption') = ("cost_items"."confidence" is not null)),
	CONSTRAINT "cost_items_percent_variable" CHECK ("cost_items"."input_mode" = 'amount' or "cost_items"."category" = 'variable'),
	CONSTRAINT "cost_items_unknown_no_value" CHECK (coalesce("cost_items"."fau"::text, '') <> 'unknown' or ("cost_items"."amount" is null and "cost_items"."percent" is null)),
	CONSTRAINT "cost_items_ranges" CHECK (("cost_items"."amount" is null or "cost_items"."amount" >= 0) and ("cost_items"."percent" is null or ("cost_items"."percent" >= 0 and "cost_items"."percent" <= 1)))
);
--> statement-breakpoint
CREATE TABLE "decision_log_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"idea_id" uuid NOT NULL,
	"business_plan_id" uuid,
	"plan_version_id" uuid,
	"kind" "decision_kind" NOT NULL,
	"value" "decision_log_value",
	"reason" text,
	"snapshot" jsonb NOT NULL,
	"recorded_by_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economics_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_id" uuid NOT NULL,
	"field_key" "economics_field" NOT NULL,
	"value" numeric(14, 4),
	"fau" "fau",
	"confidence" "level",
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economics_inputs_confidence" CHECK ((coalesce("economics_inputs"."fau"::text, '') = 'assumption') = ("economics_inputs"."confidence" is not null)),
	CONSTRAINT "economics_inputs_unknown_no_value" CHECK (coalesce("economics_inputs"."fau"::text, '') <> 'unknown' or "economics_inputs"."value" is null)
);
--> statement-breakpoint
CREATE TABLE "evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"validation_id" uuid NOT NULL,
	"target_type" "evidence_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"target_key" text,
	"research_log_entry_id" uuid,
	"url" text,
	"note" text,
	"created_by_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_links_one_source" CHECK (("evidence_links"."research_log_entry_id" is not null) <> ("evidence_links"."url" is not null))
);
--> statement-breakpoint
CREATE TABLE "execution_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_plan_id" uuid NOT NULL,
	"type" "execution_type" NOT NULL,
	"title" text NOT NULL,
	"assignee_user_id" uuid,
	"assignee_name" text,
	"due_date" date,
	"status" "execution_status",
	"goal" text,
	"exit_condition" text,
	"launch_timing" "launch_timing",
	"actions" text,
	"completion_criteria" text,
	"kpi_area" text,
	"kpi_target" text,
	"kpi_review_frequency" text,
	"kpi_actual" text,
	"kpi_actual_updated_at" timestamp with time zone,
	"why_it_matters" text,
	"answer" text,
	"from_preset" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"sort_order" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "execution_items_one_assignee" CHECK ("execution_items"."assignee_user_id" is null or "execution_items"."assignee_name" is null)
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"one_line_concept" text NOT NULL,
	"proposed_solution" text,
	"proposer_id" uuid NOT NULL,
	"duplicated_from_id" uuid,
	"latest_decision" "decision_value",
	"archived_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"email" text NOT NULL,
	"role" "workspace_role",
	"token_hash" text NOT NULL,
	"invited_by_id" uuid NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_id" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_tokenHash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_role_required" CHECK ("invitations"."workspace_id" is null or "invitations"."role" is not null)
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"actor_id" uuid,
	"comment_id" uuid,
	"decision_log_entry_id" uuid,
	"execution_item_id" uuid,
	"due_stage" "due_stage",
	"due_date" date,
	"link" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_plan_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"text" text,
	"rows" jsonb,
	"copied_from" jsonb,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_plan_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"saved_by_id" uuid NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "research_log_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_id" uuid NOT NULL,
	"observed_on" date,
	"topic" text NOT NULL,
	"observation" text,
	"source_type" "source_type",
	"source_url" text,
	"supports_checks" "supports_check"[] DEFAULT '{}' NOT NULL,
	"supports_note" text,
	"created_by_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"probability" "level",
	"impact" "level",
	"why_matters" text,
	"mitigation" text,
	"how_to_validate" text,
	"sort_order" integer,
	"deleted_at" timestamp with time zone,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "self_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"status" "self_analysis_status" DEFAULT 'not_started' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "self_analyses_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "self_analysis_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"self_analysis_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"text" text,
	"amount" numeric(14, 2),
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "self_analysis_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"self_analysis_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "template_check_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_version_id" uuid NOT NULL,
	"check_key" "check_key" NOT NULL,
	"params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_cost_defaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_version_id" uuid NOT NULL,
	"category" "cost_category" NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_execution_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_version_id" uuid NOT NULL,
	"type" "preset_type" NOT NULL,
	"title" text NOT NULL,
	"area" text,
	"launch_timing" "launch_timing",
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_version_id" uuid NOT NULL,
	"template_section_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"example" text,
	"hint" text,
	"answer_type" "answer_type" NOT NULL,
	"options" jsonb,
	"display_condition" jsonb,
	"has_fau" boolean DEFAULT false NOT NULL,
	"copy_from" jsonb,
	"reference" jsonb,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_version_id" uuid NOT NULL,
	"key" text NOT NULL,
	"part" "plan_part",
	"title" text NOT NULL,
	"guidance" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "template_version_status" DEFAULT 'draft' NOT NULL,
	"ai_prompt" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "template_kind" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_kind_unique" UNIQUE("kind")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"theme" "theme_pref" DEFAULT 'system' NOT NULL,
	"timezone" text DEFAULT 'Asia/Manila' NOT NULL,
	"last_workspace_id" uuid,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"text" text,
	"fau" "fau",
	"confidence" "level",
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_answers_confidence" CHECK ((coalesce("validation_answers"."fau"::text, '') = 'assumption') = ("validation_answers"."confidence" is not null))
);
--> statement-breakpoint
CREATE TABLE "validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validations_ideaId_unique" UNIQUE("idea_id")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"is_personal" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumptions" ADD CONSTRAINT "assumptions_validation_id_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."validations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumptions" ADD CONSTRAINT "assumptions_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_plans" ADD CONSTRAINT "business_plans_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_plans" ADD CONSTRAINT "business_plans_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_plans" ADD CONSTRAINT "business_plans_created_from_decision_id_decision_log_entries_id_fk" FOREIGN KEY ("created_from_decision_id") REFERENCES "public"."decision_log_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_plans" ADD CONSTRAINT "business_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_plans" ADD CONSTRAINT "business_plans_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_history" ADD CONSTRAINT "change_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_history" ADD CONSTRAINT "change_history_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_history" ADD CONSTRAINT "change_history_reverted_from_id_change_history_id_fk" FOREIGN KEY ("reverted_from_id") REFERENCES "public"."change_history"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_history" ADD CONSTRAINT "change_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_validation_id_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."validations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_validation_id_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."validations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log_entries" ADD CONSTRAINT "decision_log_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log_entries" ADD CONSTRAINT "decision_log_entries_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log_entries" ADD CONSTRAINT "decision_log_entries_business_plan_id_business_plans_id_fk" FOREIGN KEY ("business_plan_id") REFERENCES "public"."business_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log_entries" ADD CONSTRAINT "decision_log_entries_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log_entries" ADD CONSTRAINT "decision_log_entries_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economics_inputs" ADD CONSTRAINT "economics_inputs_validation_id_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."validations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economics_inputs" ADD CONSTRAINT "economics_inputs_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_validation_id_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."validations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_research_log_entry_id_research_log_entries_id_fk" FOREIGN KEY ("research_log_entry_id") REFERENCES "public"."research_log_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_items" ADD CONSTRAINT "execution_items_business_plan_id_business_plans_id_fk" FOREIGN KEY ("business_plan_id") REFERENCES "public"."business_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_items" ADD CONSTRAINT "execution_items_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_items" ADD CONSTRAINT "execution_items_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_proposer_id_users_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_duplicated_from_id_ideas_id_fk" FOREIGN KEY ("duplicated_from_id") REFERENCES "public"."ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_id_users_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_decision_log_entry_id_decision_log_entries_id_fk" FOREIGN KEY ("decision_log_entry_id") REFERENCES "public"."decision_log_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_execution_item_id_execution_items_id_fk" FOREIGN KEY ("execution_item_id") REFERENCES "public"."execution_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_answers" ADD CONSTRAINT "plan_answers_business_plan_id_business_plans_id_fk" FOREIGN KEY ("business_plan_id") REFERENCES "public"."business_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_answers" ADD CONSTRAINT "plan_answers_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_business_plan_id_business_plans_id_fk" FOREIGN KEY ("business_plan_id") REFERENCES "public"."business_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_saved_by_id_users_id_fk" FOREIGN KEY ("saved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_log_entries" ADD CONSTRAINT "research_log_entries_validation_id_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."validations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_log_entries" ADD CONSTRAINT "research_log_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_log_entries" ADD CONSTRAINT "research_log_entries_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_validation_id_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."validations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_analyses" ADD CONSTRAINT "self_analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_analyses" ADD CONSTRAINT "self_analyses_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_analysis_answers" ADD CONSTRAINT "self_analysis_answers_self_analysis_id_self_analyses_id_fk" FOREIGN KEY ("self_analysis_id") REFERENCES "public"."self_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_analysis_answers" ADD CONSTRAINT "self_analysis_answers_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_analysis_shares" ADD CONSTRAINT "self_analysis_shares_self_analysis_id_self_analyses_id_fk" FOREIGN KEY ("self_analysis_id") REFERENCES "public"."self_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_analysis_shares" ADD CONSTRAINT "self_analysis_shares_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_check_rules" ADD CONSTRAINT "template_check_rules_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_cost_defaults" ADD CONSTRAINT "template_cost_defaults_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_execution_presets" ADD CONSTRAINT "template_execution_presets_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_questions" ADD CONSTRAINT "template_questions_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_questions" ADD CONSTRAINT "template_questions_template_section_id_template_sections_id_fk" FOREIGN KEY ("template_section_id") REFERENCES "public"."template_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_sections" ADD CONSTRAINT "template_sections_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_last_workspace_id_workspaces_id_fk" FOREIGN KEY ("last_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_answers" ADD CONSTRAINT "validation_answers_validation_id_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."validations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_answers" ADD CONSTRAINT "validation_answers_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validations" ADD CONSTRAINT "validations_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validations" ADD CONSTRAINT "validations_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_id_account_id_index" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_index" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assumptions_validation_id_index" ON "assumptions" USING btree ("validation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_plans_idea_id_name_index" ON "business_plans" USING btree ("idea_id","name");--> statement-breakpoint
CREATE INDEX "change_history_target_type_target_id_target_key_changed_at_index" ON "change_history" USING btree ("target_type","target_id","target_key","changed_at");--> statement-breakpoint
CREATE INDEX "change_history_container_type_container_id_changed_at_index" ON "change_history" USING btree ("container_type","container_id","changed_at");--> statement-breakpoint
CREATE INDEX "change_history_workspace_id_changed_at_index" ON "change_history" USING btree ("workspace_id","changed_at");--> statement-breakpoint
CREATE INDEX "change_history_batch_id_index" ON "change_history" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_mentions_comment_id_user_id_index" ON "comment_mentions" USING btree ("comment_id","user_id");--> statement-breakpoint
CREATE INDEX "comments_target_type_target_id_target_key_index" ON "comments" USING btree ("target_type","target_id","target_key");--> statement-breakpoint
CREATE INDEX "comments_workspace_id_created_at_index" ON "comments" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "competitors_validation_id_index" ON "competitors" USING btree ("validation_id");--> statement-breakpoint
CREATE INDEX "cost_items_validation_id_category_index" ON "cost_items" USING btree ("validation_id","category");--> statement-breakpoint
CREATE INDEX "decision_log_entries_workspace_id_recorded_at_index" ON "decision_log_entries" USING btree ("workspace_id","recorded_at");--> statement-breakpoint
CREATE INDEX "decision_log_entries_idea_id_recorded_at_index" ON "decision_log_entries" USING btree ("idea_id","recorded_at");--> statement-breakpoint
CREATE INDEX "decision_log_entries_business_plan_id_index" ON "decision_log_entries" USING btree ("business_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "economics_inputs_validation_id_field_key_index" ON "economics_inputs" USING btree ("validation_id","field_key");--> statement-breakpoint
CREATE INDEX "evidence_links_target_type_target_id_target_key_index" ON "evidence_links" USING btree ("target_type","target_id","target_key");--> statement-breakpoint
CREATE INDEX "evidence_links_research_log_entry_id_index" ON "evidence_links" USING btree ("research_log_entry_id");--> statement-breakpoint
CREATE INDEX "execution_items_business_plan_id_type_index" ON "execution_items" USING btree ("business_plan_id","type");--> statement-breakpoint
CREATE INDEX "execution_items_due_idx" ON "execution_items" USING btree ("due_date") WHERE "execution_items"."due_date" is not null and "execution_items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ideas_workspace_id_last_activity_at_index" ON "ideas" USING btree ("workspace_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "invitations_workspace_id_index" ON "invitations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "invitations_email_lower_idx" ON "invitations" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_workspace_id_user_id_index" ON "memberships" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_id_index" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_index" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_due_once_uq" ON "notifications" USING btree ("execution_item_id","due_date","due_stage") WHERE "notifications"."kind" = 'due';--> statement-breakpoint
CREATE UNIQUE INDEX "plan_answers_business_plan_id_question_key_index" ON "plan_answers" USING btree ("business_plan_id","question_key");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_business_plan_id_version_number_index" ON "plan_versions" USING btree ("business_plan_id","version_number");--> statement-breakpoint
CREATE INDEX "research_log_entries_validation_id_observed_on_index" ON "research_log_entries" USING btree ("validation_id","observed_on");--> statement-breakpoint
CREATE INDEX "risks_validation_id_index" ON "risks" USING btree ("validation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "self_analysis_answers_self_analysis_id_question_key_index" ON "self_analysis_answers" USING btree ("self_analysis_id","question_key");--> statement-breakpoint
CREATE UNIQUE INDEX "self_analysis_shares_self_analysis_id_workspace_id_index" ON "self_analysis_shares" USING btree ("self_analysis_id","workspace_id");--> statement-breakpoint
CREATE INDEX "self_analysis_shares_workspace_id_index" ON "self_analysis_shares" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_check_rules_template_version_id_check_key_index" ON "template_check_rules" USING btree ("template_version_id","check_key");--> statement-breakpoint
CREATE UNIQUE INDEX "template_cost_defaults_template_version_id_key_index" ON "template_cost_defaults" USING btree ("template_version_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "template_questions_template_version_id_question_key_index" ON "template_questions" USING btree ("template_version_id","question_key");--> statement-breakpoint
CREATE INDEX "template_questions_template_section_id_index" ON "template_questions" USING btree ("template_section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_sections_template_version_id_key_index" ON "template_sections" USING btree ("template_version_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_template_id_version_number_index" ON "template_versions" USING btree ("template_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_one_draft_uq" ON "template_versions" USING btree ("template_id") WHERE "template_versions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "validation_answers_validation_id_question_key_index" ON "validation_answers" USING btree ("validation_id","question_key");--> statement-breakpoint
CREATE INDEX "verifications_identifier_index" ON "verifications" USING btree ("identifier");