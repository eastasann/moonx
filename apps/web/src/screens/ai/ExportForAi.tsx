import type { TemplateKind } from "@moonx/schemas";
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Flex,
  Heading,
  InlineAlert,
  Link,
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
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArchivedState,
  ErrorState,
  LoadingState,
  NoAccessState,
  NotFoundState,
  QueryBoundary,
} from "../../components/states";
import {
  type ExportOptions,
  exportQuery,
  type ImportContext,
  importContextQuery,
  isOtherWorkspace,
  sourcePath,
} from "../../lib/ai-exchange";
import { scopeOfSections, sectionsOfScope } from "../../lib/ai-scope";
import { isApiError } from "../../lib/api-error";
import { errorText } from "../../lib/error-text";
import { copyText, downloadText } from "../../lib/file-save";
import { canEditIdeas, useWorkspaceRole } from "../../lib/ideas";
import { SOURCE_KEYS } from "./labels";
import { ScopePicker } from "./ScopePicker";
import { SourceBackLink } from "./SourceBackLink";

export interface ExportForAiProps {
  workspaceId: string;
  source: TemplateKind;
  /** The validation or plan; a self analysis is the person's own and has none. */
  id?: string;
  /** `?scope=`: what the screen that sent the person here was showing. */
  scope?: string;
}

function ExportSkeleton() {
  return (
    <Stack gap="space-200">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

/**
 * Screen 24: choose what to hand to an AI, check the text, copy or download it (design-spec 6.6).
 * Nothing is saved: an export leaves no history entry.
 */
export function ExportForAi(props: ExportForAiProps) {
  const role = useWorkspaceRole(props.workspaceId);
  if (!canEditIdeas(role)) return <NoAccessState />;
  if (props.source !== "self_analysis" && !props.id) return <NotFoundState />;
  return <ExportLoader {...props} />;
}

function ExportLoader(props: ExportForAiProps) {
  const context = useQuery(importContextQuery(props.source, props.id));
  return (
    <QueryBoundary query={context} skeleton={<ExportSkeleton />}>
      {(data) => {
        if (isOtherWorkspace(props.workspaceId, data.target)) return <NoAccessState />;
        return data.target.archived ? <ArchivedState /> : <ExportFlow {...props} context={data} />;
      }}
    </QueryBoundary>
  );
}

type Step = "scope" | "review" | "export";
type Format = "markdown" | "json";

const STEP_IDS: readonly Step[] = ["scope", "review", "export"];

function ExportFlow({
  workspaceId,
  source,
  id,
  scope,
  context,
}: ExportForAiProps & { context: ImportContext }) {
  const { t } = useTranslation(["ai", "errors", "app"]);
  const exportable = useMemo(() => context.sections.filter((s) => s.importable), [context]);
  const [step, setStep] = useState<Step>("scope");
  const [selected, setSelected] = useState(() => sectionsOfScope(scope, exportable));
  const [options, setOptions] = useState<ExportOptions>({
    includeEmpty: true,
    includeExamples: true,
    includeReference: true,
  });
  const [format, setFormat] = useState<Format>("markdown");
  const [notice, setNotice] = useState<"copied" | "failed" | null>(null);

  const built = useQuery({
    ...exportQuery({ kind: source, id, selected, sections: exportable, options }),
    enabled: step !== "scope",
  });

  const hasReference = source !== "self_analysis";
  const chosen = new Set(selected);
  const importHref = `/w/${workspaceId}/ai/import?${new URLSearchParams({
    target: source,
    ...(id ? { id } : {}),
    scope: scopeOfSections(selected, exportable),
  })}`;

  const stepItems = STEP_IDS.map((stepId) => ({ id: stepId, label: t(`export.steps.${stepId}`) }));
  const emptyScope = built.isError && isApiError(built.error) && built.error.code === "EMPTY_SCOPE";

  const header = (
    <Stack gap="space-100">
      <SourceBackLink href={sourcePath(workspaceId, context.target)} />
      <Heading level={1}>{t("export.title")}</Heading>
      <Text tone="secondary">{t(SOURCE_KEYS[source], { name: context.target.name })}</Text>
    </Stack>
  );

  const copy = async (text: string) => setNotice((await copyText(text)) ? "copied" : "failed");
  const text = (which: Format) =>
    which === "markdown"
      ? (built.data?.markdown ?? "")
      : JSON.stringify(built.data?.json ?? {}, null, 2);

  let body: React.ReactNode;
  let actions: React.ReactNode;
  if (step === "scope") {
    body = (
      <Stack gap="space-300">
        <ScopePicker
          kind={source}
          sections={exportable}
          selected={selected}
          onChange={setSelected}
        />
        <CheckboxGroup
          label={t("export.scope.options")}
          value={(Object.keys(options) as (keyof ExportOptions)[]).filter((k) => options[k])}
          onChange={(keys) =>
            setOptions({
              includeEmpty: keys.includes("includeEmpty"),
              includeExamples: keys.includes("includeExamples"),
              includeReference: keys.includes("includeReference"),
            })
          }
        >
          <Checkbox value="includeEmpty">{t("export.scope.includeEmpty")}</Checkbox>
          <Checkbox value="includeExamples">{t("export.scope.includeExamples")}</Checkbox>
          {hasReference ? (
            <Checkbox value="includeReference">
              {source === "business_plan"
                ? t("export.scope.includeReferencePlan")
                : t("export.scope.includeReference")}
            </Checkbox>
          ) : null}
        </CheckboxGroup>
        {chosen.size === 0 ? <Text tone="negative">{t("export.scope.chooseOne")}</Text> : null}
      </Stack>
    );
    actions = (
      <Flex justify="end" gap="space-200">
        <Button isDisabled={chosen.size === 0} onPress={() => setStep("review")}>
          {t("export.next")}
        </Button>
      </Flex>
    );
  } else if (built.isPending) {
    body = <LoadingState skeleton={<ExportSkeleton />} onRetry={() => void built.refetch()} />;
    actions = null;
  } else if (emptyScope) {
    body = (
      <InlineAlert variant="notice" heading={t("export.review.emptyScope")}>
        {errorText(t, built.error)}
      </InlineAlert>
    );
    actions = (
      <Flex justify="start">
        <Button variant="secondary" onPress={() => setStep("scope")}>
          {t("app:back")}
        </Button>
      </Flex>
    );
  } else if (built.isError) {
    body = <ErrorState error={built.error} onRetry={() => void built.refetch()} />;
    actions = (
      <Flex justify="start">
        <Button variant="secondary" onPress={() => setStep("scope")}>
          {t("app:back")}
        </Button>
      </Flex>
    );
  } else if (step === "review") {
    body = (
      <Stack gap="space-200">
        <Flex gap="space-200" align="center" justify="between" wrap>
          <Text variant="label" as="span">
            {t("export.review.questions", { count: built.data.questionCount })}
          </Text>
          <SegmentedControl
            aria-label={t("export.review.format")}
            value={format}
            onChange={(value) => setFormat(value as Format)}
          >
            <SegmentedControlItem value="markdown">
              {t("export.review.markdown")}
            </SegmentedControlItem>
            <SegmentedControlItem value="json">{t("export.review.json")}</SegmentedControlItem>
          </SegmentedControl>
        </Flex>
        {built.data.allEmpty ? (
          <InlineAlert variant="notice" heading={t("export.review.allEmpty")}>
            {t("export.review.allEmptyBody")}
          </InlineAlert>
        ) : null}
        <Well preformatted aria-label={t("export.review.preview")}>
          {text(format)}
        </Well>
      </Stack>
    );
    actions = (
      <Flex justify="between" gap="space-200">
        <Button variant="secondary" onPress={() => setStep("scope")}>
          {t("app:back")}
        </Button>
        <Button onPress={() => setStep("export")}>{t("export.next")}</Button>
      </Flex>
    );
  } else {
    const { fileBaseName } = built.data;
    body = (
      <Stack gap="space-300">
        {built.data.allEmpty ? (
          <InlineAlert variant="notice" heading={t("export.review.allEmpty")}>
            {t("export.review.allEmptyBody")}
          </InlineAlert>
        ) : null}
        <Flex gap="space-200" wrap>
          <Button variant="secondary" onPress={() => void copy(text("markdown"))}>
            {t("export.done.copyMarkdown")}
          </Button>
          <Button
            variant="secondary"
            onPress={() => downloadText(`${fileBaseName}.md`, text("markdown"), "text/markdown")}
          >
            {t("export.done.downloadMarkdown")}
          </Button>
          <Button variant="secondary" onPress={() => void copy(text("json"))}>
            {t("export.done.copyJson")}
          </Button>
          <Button
            variant="secondary"
            onPress={() => downloadText(`${fileBaseName}.json`, text("json"), "application/json")}
          >
            {t("export.done.downloadJson")}
          </Button>
        </Flex>
        {notice === "copied" ? (
          <InlineAlert variant="informative" heading={t("export.done.copied")} />
        ) : null}
        {notice === "failed" ? (
          <InlineAlert variant="notice" heading={t("export.done.copyFailed")} />
        ) : null}
        <Flex gap="space-200" align="center" wrap>
          <Text tone="secondary">{t("export.done.next")}</Text>
          <Link href={importHref}>{t("export.done.importLink")}</Link>
        </Flex>
      </Stack>
    );
    actions = (
      <Flex justify="start">
        <Button variant="secondary" onPress={() => setStep("review")}>
          {t("app:back")}
        </Button>
      </Flex>
    );
  }

  return (
    <StepsPattern
      header={header}
      steps={<Steps aria-label={t("export.steps.label")} items={stepItems} current={step} />}
      actions={actions}
    >
      {body}
    </StepsPattern>
  );
}
