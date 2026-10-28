import { type AiScope, isInScope } from "@moonx/domain";
import type { TemplateKind } from "@moonx/schemas";
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Flex,
  Heading,
  InlineAlert,
  Radio,
  RadioGroup,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
  Stack,
  Steps,
  StepsPattern,
  Text,
  Well,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Copy, Download } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { type AiTarget, AiTargetScreen } from "../components/AiTargetScreen";
import { rateLimitWords } from "../components/SendFailure";
import { FailureState } from "../components/states";
import { dashboardHref, useWorkspace } from "../components/workspace";
import { aiImportHref, parseScope, scopeParam } from "../lib/ai";
import { copyText, downloadText } from "../lib/files";
import { aiExportQuery } from "../lib/queries";

/** `/w/$workspaceId/ai/export`'s search parameters (SDD 4章). */
export interface AiExportSearch {
  source?: TemplateKind;
  id?: string;
  scope?: string;
  returnTo?: string;
}

/** 24's steps (design-spec 6.6). */
const STEPS = ["scope", "review", "export"] as const;
type Step = (typeof STEPS)[number];

/** What a plan's export covers (design-spec 6.6「範囲」). */
type PlanChoice = "all" | "a" | "b" | "items";

const OPTIONS = [
  "includeEmpty",
  "includeExamples",
  "includeReference",
] as const;
type Option = (typeof OPTIONS)[number];

type Format = "markdown" | "json";

/** The title and what it exports from, above the steps (as 25's, s25-import.html). */
function Header({ eyebrow }: { eyebrow: ReactNode }) {
  const { t } = useTranslation(["ai"]);
  return (
    <Stack gap="space-75">
      <Text variant="caption" tone="secondary">
        {eyebrow}
      </Text>
      <Heading level={1} variant="heading-1-steps">
        {t("ai:export.title")}
      </Heading>
    </Stack>
  );
}

function ExportSteps({ current }: { current: Step }) {
  const { t } = useTranslation(["ai"]);
  return (
    <Steps
      aria-label={t("ai:steps")}
      steps={STEPS.map((id) => ({ id, label: t(`ai:export.step.${id}`) }))}
      currentId={current}
      doneLabel={t("ai:stepDone")}
    />
  );
}

/** The preview's shape while X1 answers (design-spec 6.6「ローディング」). */
function PreviewSkeleton() {
  const { t } = useTranslation(["ai"]);
  return (
    <Skeleton isLoading>
      <Well>
        <Stack gap="space-100">
          {[0, 1, 2, 3, 4].map((line) => (
            <Text key={line}>{t("ai:export.preview")}</Text>
          ))}
        </Stack>
      </Well>
    </Skeleton>
  );
}

/** 24's shape while its target loads (design-spec 6.0.6). */
export function AiExportSkeleton() {
  const { t } = useTranslation(["ai"]);
  return (
    <StepsPattern
      header={<Header eyebrow={t("ai:export.preview")} />}
      steps={<ExportSteps current="scope" />}
    >
      <PreviewSkeleton />
    </StepsPattern>
  );
}

/**
 * The scope 24 opens on (design-spec 6.6「範囲の初期値」): the link's, else the whole. All
 * the template's sections are offered, those without a question to answer too: their
 * tables go into the Reference of the items chosen (6.6「範囲」).
 */
function initialScope(target: AiTarget, param: string | undefined) {
  const { sections } = target.context;
  const scope = parseScope(target.kind, param, sections);
  const pad = (itemNo: number) => String(itemNo).padStart(2, "0");
  return {
    sections,
    keys:
      scope.kind === "sections"
        ? [...scope.keys]
        : scope.kind === "items"
          ? scope.itemNos.map(pad)
          : target.kind === "business_plan"
            ? []
            : sections.map((section) => section.key),
    plan:
      scope.kind === "items"
        ? "items"
        : scope.kind === "part"
          ? scope.part
          : ("all" as PlanChoice),
  };
}

/**
 * X1's failure (SDD 5.10) in place of the preview: the rate limit's wait with Retry, or
 * the state of 6.0.6 for a failure to load.
 */
function ExportFailure({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation(["ai", "app"]);
  const { me } = useWorkspace();
  const rateLimited = rateLimitWords(error);
  if (rateLimited !== null) {
    return (
      <InlineAlert variant="negative" title={t("ai:export.couldNotExport")}>
        <Flex gap="space-200" alignItems="center" wrap>
          <Text>{rateLimited}</Text>
          <Button variant="secondary" size="S" onPress={onRetry}>
            {t("app:state.retry")}
          </Button>
        </Flex>
      </InlineAlert>
    );
  }
  return (
    <FailureState
      error={error}
      onRetry={onRetry}
      dashboardHref={dashboardHref(me)}
      headingLevel={2}
      size="S"
    />
  );
}

function ExportFlow({
  target,
  scopeParam: param,
}: {
  target: AiTarget;
  scopeParam: string | undefined;
}) {
  const { t } = useTranslation(["ai", "app"]);
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const { kind, id } = target;
  const isPlan = kind === "business_plan";
  const [initial] = useState(() => initialScope(target, param));
  const { sections } = initial;
  const [step, setStep] = useState<Step>("scope");
  const [keys, setKeys] = useState<string[]>(initial.keys);
  const [plan, setPlan] = useState<PlanChoice>(initial.plan);
  const [options, setOptions] = useState<string[]>([...OPTIONS]);
  const [format, setFormat] = useState<Format>("markdown");
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);

  // In template order, whatever order the boxes were ticked in.
  const ordered = sections
    .map((section) => section.key)
    .filter((key) => keys.includes(key));
  let scope: AiScope | null;
  if (isPlan) {
    scope =
      plan === "all"
        ? { kind: "all" }
        : plan === "items"
          ? ordered.length === 0
            ? null
            : { kind: "items", itemNos: ordered.map(Number) }
          : { kind: "part", part: plan };
  } else {
    scope =
      ordered.length === 0
        ? null
        : ordered.length === sections.length
          ? { kind: "all" }
          : { kind: "sections", keys: ordered };
  }
  // A scope with nothing an AI can answer is refused by X1 (422 EMPTY_SCOPE), so it is
  // not sent: Next waits for a section or item with a question.
  const scopeError =
    scope === null
      ? t(isPlan ? "ai:export.chooseItem" : "ai:export.chooseSection")
      : sections.some(
            (section) =>
              section.importable && isInScope(scope, section.key, sections),
          )
        ? undefined
        : t(isPlan ? "ai:export.noQuestionsPlan" : "ai:export.noQuestions");
  const has = (option: Option) => options.includes(option);
  const exported = useQuery({
    ...aiExportQuery(kind, id, {
      scope: scope ?? { kind: "all" },
      includeEmpty: has("includeEmpty"),
      includeExamples: has("includeExamples"),
      // A self-analysis has no Reference (design-spec 6.6「範囲」).
      includeReference: kind !== "self_analysis" && has("includeReference"),
    }),
    enabled:
      step !== "scope" && scopeError === undefined && target.archived === null,
  });

  const header = <Header eyebrow={target.eyebrow} />;
  if (target.archived !== null) {
    // Nothing exported here could be imported back (6.6「状態」).
    return (
      <StepsPattern header={header} steps={<ExportSteps current="scope" />}>
        <InlineAlert>{t(`ai:archived.${target.archived}`)}</InlineAlert>
      </StepsPattern>
    );
  }

  const go = (next: Step) => {
    setCopied(null);
    setStep(next);
  };
  const data = exported.data;
  const allEmpty = data?.allEmpty === true && (
    <InlineAlert variant="notice">{t("ai:export.allEmpty")}</InlineAlert>
  );
  const textOf = (shown: Format) =>
    data === undefined
      ? ""
      : shown === "markdown"
        ? data.markdown
        : `${JSON.stringify(data.json, null, 2)}\n`;
  const copy = (shown: Format) => {
    setCopied(null);
    copyText(textOf(shown)).then(
      () => setCopied("copied"),
      () => setCopied("failed"),
    );
  };
  const download = (shown: Format) => {
    if (data === undefined) return;
    if (shown === "markdown") {
      downloadText(
        `${data.fileBaseName}.md`,
        textOf(shown),
        "text/markdown;charset=utf-8",
      );
    } else {
      downloadText(
        `${data.fileBaseName}.json`,
        textOf(shown),
        "application/json;charset=utf-8",
      );
    }
  };

  let content: ReactNode;
  let actions: ReactNode;
  if (step === "scope") {
    const sectionLabel = (section: (typeof sections)[number]) =>
      kind === "self_analysis"
        ? section.title
        : `${section.key} ${section.title}`;
    content = (
      <Stack gap="space-400">
        {isPlan ? (
          <Stack gap="space-300">
            <RadioGroup
              label={t("ai:export.planScope")}
              value={plan}
              onChange={(value) => setPlan(value as PlanChoice)}
              errorMessage={plan === "items" ? undefined : scopeError}
            >
              <Radio value="all">{t("ai:export.wholePlan")}</Radio>
              <Radio value="a">{t("ai:export.partA")}</Radio>
              <Radio value="b">{t("ai:export.partB")}</Radio>
              <Radio value="items">{t("ai:export.chooseItems")}</Radio>
            </RadioGroup>
            {plan === "items" && (
              <CheckboxGroup
                label={t("ai:export.items")}
                value={keys}
                onChange={setKeys}
                errorMessage={scopeError}
              >
                {sections.map((section) => (
                  <Checkbox key={section.key} value={section.key}>
                    {sectionLabel(section)}
                  </Checkbox>
                ))}
              </CheckboxGroup>
            )}
          </Stack>
        ) : (
          <CheckboxGroup
            label={t("ai:export.sections")}
            orientation="horizontal"
            value={keys}
            onChange={setKeys}
            errorMessage={scopeError}
          >
            {sections.map((section) => (
              <Checkbox key={section.key} value={section.key}>
                {sectionLabel(section)}
              </Checkbox>
            ))}
          </CheckboxGroup>
        )}
        <CheckboxGroup
          label={t("ai:export.options")}
          value={options}
          onChange={setOptions}
        >
          <Checkbox value="includeEmpty">
            {t("ai:export.includeEmpty")}
          </Checkbox>
          <Checkbox value="includeExamples">
            {t("ai:export.includeExamples")}
          </Checkbox>
          {kind !== "self_analysis" && (
            <Checkbox value="includeReference">
              {isPlan
                ? t("ai:export.includeReferencePlan")
                : t("ai:export.includeReference")}
            </Checkbox>
          )}
        </CheckboxGroup>
      </Stack>
    );
    actions = (
      <Button
        key="next"
        variant="primary"
        onPress={() => go("review")}
        isDisabled={scopeError !== undefined}
      >
        {t("ai:nextStep")}
        <ArrowRight />
      </Button>
    );
  } else {
    const back = (
      <Button
        key="back"
        variant="secondary"
        onPress={() => go(step === "export" ? "review" : "scope")}
      >
        <ArrowLeft />
        {t("ai:previousStep")}
      </Button>
    );
    if (exported.isError && data === undefined) {
      content = (
        <ExportFailure
          error={exported.error}
          onRetry={() => void exported.refetch()}
        />
      );
    } else if (data === undefined) {
      content = <PreviewSkeleton />;
    } else if (step === "review") {
      content = (
        <Stack gap="space-300">
          {allEmpty}
          <SegmentedControl
            aria-label={t("ai:export.format")}
            selectedKey={format}
            onSelectionChange={(key) => setFormat(key as Format)}
          >
            <SegmentedControlItem id="markdown">
              {t("ai:export.markdown")}
            </SegmentedControlItem>
            <SegmentedControlItem id="json">
              {t("ai:export.json")}
            </SegmentedControlItem>
          </SegmentedControl>
          <Well role="region" aria-label={t("ai:export.preview")}>
            <Text variant="body-long" elementType="div">
              {textOf(format)}
            </Text>
          </Well>
        </Stack>
      );
    } else {
      content = (
        <Stack gap="space-300">
          {allEmpty}
          <Flex gap="space-100" wrap>
            <Button variant="secondary" onPress={() => copy("markdown")}>
              <Copy />
              {t("ai:export.copyMarkdown")}
            </Button>
            <Button variant="secondary" onPress={() => download("markdown")}>
              <Download />
              {t("ai:export.downloadMarkdown")}
            </Button>
          </Flex>
          <Flex gap="space-100" wrap>
            <Button variant="secondary" onPress={() => copy("json")}>
              <Copy />
              {t("ai:export.copyJson")}
            </Button>
            <Button variant="secondary" onPress={() => download("json")}>
              <Download />
              {t("ai:export.downloadJson")}
            </Button>
          </Flex>
          {/* Read out when the copy is done. */}
          <output>
            {copied !== null && (
              <Text variant="caption" tone="secondary">
                {copied === "copied"
                  ? t("ai:export.copied")
                  : t("ai:export.copyFailed")}
              </Text>
            )}
          </output>
          <Flex gap="space-200" alignItems="center" wrap>
            <Text tone="secondary">{t("ai:export.then")}</Text>
            <Button
              variant="primary"
              onPress={() =>
                void navigate({
                  href: aiImportHref(workspace.id, {
                    kind,
                    id,
                    scope: scope === null ? undefined : scopeParam(scope),
                    returnTo: target.returnHref,
                  }),
                })
              }
            >
              {t("ai:menu.import")}
            </Button>
          </Flex>
        </Stack>
      );
    }
    actions =
      step === "review" ? (
        <>
          {back}
          <Button
            key="next"
            variant="primary"
            onPress={() => go("export")}
            isDisabled={data === undefined}
          >
            {t("ai:nextStep")}
            <ArrowRight />
          </Button>
        </>
      ) : (
        back
      );
  }
  return (
    <StepsPattern
      header={header}
      steps={<ExportSteps current={step} />}
      actions={actions}
      focusKey={step}
    >
      {content}
    </StepsPattern>
  );
}

/**
 * 24 Export for AI (design-spec 6.6): pattern G. ① the scope (sections, or a plan's
 * whole, part or items) and the options, ② the export's preview as Markdown or JSON,
 * ③ copying or downloading it, and on to 25 with the same scope. Nothing is recorded.
 * Owners and Members only (a self-analysis is its owner's); an archived idea or plan
 * says so and offers nothing.
 */
export function AiExportScreen({ search }: { search: AiExportSearch }) {
  const { t } = useTranslation(["ai"]);
  return (
    <AiTargetScreen
      search={{ kind: search.source, id: search.id, returnTo: search.returnTo }}
      title={t("ai:export.title")}
      skeleton={<AiExportSkeleton />}
    >
      {(target) => <ExportFlow target={target} scopeParam={search.scope} />}
    </AiTargetScreen>
  );
}
