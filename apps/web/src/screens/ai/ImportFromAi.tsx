import { MAX_REPLY_CHARS, parseAiReply, type ReplyBlock } from "@moonx/domain";
import type { TemplateKind } from "@moonx/schemas";
import {
  Button,
  Flex,
  Heading,
  InlineAlert,
  ProgressCircle,
  Skeleton,
  Stack,
  Steps,
  StepsPattern,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArchivedState,
  NoAccessState,
  NotFoundState,
  QueryBoundary,
} from "../../components/states";
import {
  applyImportChanges,
  type ImportContext,
  importContextQuery,
  isOtherWorkspace,
  sourcePath,
  targetKey,
} from "../../lib/ai-exchange";
import {
  type MatchChoices,
  matchTargets,
  NO_CHOICES,
  pickableTargets,
  resolveMatches,
} from "../../lib/ai-match";
import {
  applicable,
  applyBody,
  draftOf,
  evaluate,
  type ReviewDraft,
  type ReviewEntry,
} from "../../lib/ai-review";
import { importScopeSections } from "../../lib/ai-scope";
import { isApiError } from "../../lib/api-error";
import { errorText } from "../../lib/error-text";
import { IDEAS_KEY } from "../../lib/idea-actions";
import { canEditIdeas, useWorkspaceRole } from "../../lib/ideas";
import { useGoTo } from "../../lib/navigate";
import { toasts } from "../../lib/toast";
import { MatchStep } from "./MatchStep";
import { PasteStep } from "./PasteStep";
import { ReviewStep } from "./ReviewStep";
import { SourceBackLink } from "./SourceBackLink";

export interface ImportFromAiProps {
  workspaceId: string;
  target: TemplateKind;
  /** The validation or plan; a self analysis is the person's own and has none. */
  id?: string;
  /** `?scope=`: the questions the reply may answer. */
  scope?: string;
  /** `?returnTo=`: where to go after the import or on Cancel; the source screen when absent. */
  returnTo?: string;
}

function ImportSkeleton() {
  return (
    <Stack gap="space-200">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

/**
 * Screen 25: paste or upload an AI's reply, match its blocks to questions, review the changes
 * against the answers now and apply them together (design-spec 6.7). Reading and matching happen
 * here; the server checks the changes again when they are applied.
 */
export function ImportFromAi(props: ImportFromAiProps) {
  const role = useWorkspaceRole(props.workspaceId);
  if (!canEditIdeas(role)) return <NoAccessState />;
  if (props.target !== "self_analysis" && !props.id) return <NotFoundState />;
  return <ImportLoader {...props} />;
}

function ImportLoader(props: ImportFromAiProps) {
  const context = useQuery(importContextQuery(props.target, props.id));
  return (
    <QueryBoundary query={context} skeleton={<ImportSkeleton />}>
      {(data) => {
        if (isOtherWorkspace(props.workspaceId, data.target)) return <NoAccessState />;
        return data.target.archived ? <ArchivedState /> : <ImportFlow {...props} context={data} />;
      }}
    </QueryBoundary>
  );
}

type Step = "paste" | "match" | "review" | "apply";
const STEP_IDS: readonly Step[] = ["paste", "match", "review", "apply"];

function ImportFlow({
  workspaceId,
  target,
  id,
  scope,
  returnTo,
  context,
}: ImportFromAiProps & { context: ImportContext }) {
  const { t } = useTranslation(["ai", "errors", "app"]);
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const contextKey = importContextQuery(target, id).queryKey;

  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [fileTooBig, setFileTooBig] = useState(false);
  const [noIds, setNoIds] = useState(false);
  const [blocks, setBlocks] = useState<ReplyBlock[]>([]);
  const [choices, setChoices] = useState<MatchChoices>(NO_CHOICES);
  const [edits, setEdits] = useState<Record<string, Partial<ReviewDraft>>>({});
  const [conflict, setConflict] = useState(false);
  const [applyError, setApplyError] = useState<unknown>(null);
  // The versions the answers had when the screen opened: a different one later means someone saved it.
  const [baseline] = useState(
    () => new Map(context.questions.map((q) => [q.questionKey, q.current.lockVersion])),
  );

  const inScope = useMemo(
    () => importScopeSections(context.target.type, scope, context.sections),
    [context, scope],
  );
  const targets = useMemo(() => matchTargets(context, inScope), [context, inScope]);
  const outcome = useMemo(
    () => resolveMatches(blocks, targets, choices),
    [blocks, targets, choices],
  );

  const entries = useMemo(() => {
    const order = new Map(context.questions.map((q, index) => [q.questionKey, index]));
    const byKey = new Map(context.questions.map((q) => [q.questionKey, q]));
    return outcome.resolved
      .flatMap(({ questionKey, block }): (ReviewEntry & { order: number })[] => {
        const question = byKey.get(questionKey);
        if (!question) return [];
        const draft = { ...draftOf(question, block), ...edits[`${questionKey}:${block.index}`] };
        return [
          {
            question,
            draft,
            evaluation: evaluate(question, draft),
            order: order.get(questionKey) ?? 0,
          },
        ];
      })
      .sort((a, b) => a.order - b.order);
  }, [context, outcome, edits]);

  const updatedAfterLoad = useMemo(
    () =>
      new Set(
        context.questions
          .filter((q) => baseline.get(q.questionKey) !== q.current.lockVersion)
          .map((q) => q.questionKey),
      ),
    [context, baseline],
  );

  const blockOf = (questionKey: string) =>
    outcome.resolved.find((r) => r.questionKey === questionKey)?.block.index ?? 0;
  const editDraft = (questionKey: string, patch: Partial<ReviewDraft>) =>
    setEdits((previous) => {
      const key = `${questionKey}:${blockOf(questionKey)}`;
      return { ...previous, [key]: { ...previous[key], ...patch } };
    });

  const isTooLong = fileTooBig || text.length > MAX_REPLY_CHARS;
  const changes = applicable(entries);
  const backPath = returnTo ?? sourcePath(workspaceId, context.target);
  const leave = () => goTo(backPath, { replace: true });

  const submitPaste = () => {
    const parsed = parseAiReply(text);
    if (!parsed.blocks.some((block) => block.id !== null)) {
      setNoIds(true);
      return;
    }
    setNoIds(false);
    setBlocks(parsed.blocks);
    setChoices(NO_CHOICES);
    setStep("match");
  };
  const continueWhole = () => {
    setNoIds(false);
    setBlocks([
      { index: 0, id: null, heading: null, text: text.trim(), amount: null, reason: null },
    ]);
    setChoices(NO_CHOICES);
    setStep("match");
  };
  const openReview = () => {
    // Current is read again so a change made while the person was matching shows up.
    void queryClient.invalidateQueries({ queryKey: contextKey, exact: true });
    setStep("review");
  };

  const apply = async () => {
    setStep("apply");
    setApplyError(null);
    try {
      const result = await applyImportChanges(
        applyBody({ type: context.target.type, id: context.target.id }, entries),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: targetKey(target, id) }),
        queryClient.invalidateQueries({ queryKey: IDEAS_KEY }),
      ]);
      const updated = t("import.apply.updated", { count: result.applied });
      toasts.add({
        title:
          result.needsClassification > 0
            ? t("import.apply.summary", {
                updated,
                needs: t("import.apply.needsFau", { count: result.needsClassification }),
              })
            : updated,
        variant: "positive",
      });
      leave();
    } catch (error) {
      if (isApiError(error) && error.code === "CONFLICT_MULTI") {
        await queryClient.refetchQueries({ queryKey: contextKey, exact: true });
        setConflict(true);
        setStep("review");
        return;
      }
      setApplyError(error);
    }
  };

  const header = (
    <Stack gap="space-100">
      <SourceBackLink href={backPath} />
      <Heading level={1}>{t("import.titleFor", { name: context.target.name })}</Heading>
    </Stack>
  );
  const stepItems = STEP_IDS.map((stepId) => ({ id: stepId, label: t(`import.steps.${stepId}`) }));

  let body: ReactNode;
  let actions: ReactNode = null;
  if (step === "paste") {
    body = (
      <PasteStep
        text={text}
        onText={(next) => {
          setText(next);
          setFileTooBig(false);
          setNoIds(false);
        }}
        isTooLong={isTooLong}
        onFileTooLong={() => setFileTooBig(true)}
        noIds={noIds ? { exampleId: pickableTargets(targets)[0]?.key ?? "ID" } : null}
        onContinueWhole={continueWhole}
      />
    );
    actions = (
      <Flex justify="end">
        <Button isDisabled={text.trim() === "" || isTooLong} onPress={submitPaste}>
          {t("export.next")}
        </Button>
      </Flex>
    );
  } else if (step === "match") {
    body = (
      <MatchStep
        targets={targets}
        outcome={outcome}
        choices={choices}
        onChoices={setChoices}
        onBackToPaste={() => setStep("paste")}
      />
    );
    actions = (
      <Flex justify="between" gap="space-200">
        <Button variant="secondary" onPress={() => setStep("paste")}>
          {t("app:back")}
        </Button>
        <Button isDisabled={outcome.resolved.length === 0} onPress={openReview}>
          {t("export.next")}
        </Button>
      </Flex>
    );
  } else if (step === "review") {
    body = (
      <ReviewStep
        entries={entries}
        currency={context.target.currency}
        updatedAfterLoad={updatedAfterLoad}
        conflict={conflict}
        onDraft={editDraft}
        onClose={leave}
      />
    );
    actions = (
      <Flex justify="between" gap="space-200">
        <Button variant="secondary" onPress={() => setStep("match")}>
          {t("app:back")}
        </Button>
        <Flex gap="space-200">
          <Button variant="secondary" onPress={leave}>
            {t("import.review.cancel")}
          </Button>
          <Button
            variant="accent"
            isDisabled={changes.count === 0 || changes.blocked}
            onPress={() => void apply()}
          >
            {t("import.review.apply", { count: changes.count })}
          </Button>
        </Flex>
      </Flex>
    );
  } else if (applyError) {
    body = (
      <Stack gap="space-200">
        <InlineAlert variant="negative" heading={t("import.apply.failed")}>
          {errorText(t, applyError)}
        </InlineAlert>
        <Flex gap="space-200">
          <Button variant="secondary" onPress={() => setStep("review")}>
            {t("import.apply.backToReview")}
          </Button>
          <Button onPress={() => void apply()}>{t("import.apply.retry")}</Button>
        </Flex>
      </Stack>
    );
  } else {
    body = (
      <Flex gap="space-200" align="center">
        <ProgressCircle isIndeterminate aria-label={t("import.apply.applying")} />
      </Flex>
    );
  }

  return (
    <StepsPattern
      header={header}
      steps={<Steps aria-label={t("import.steps.label")} items={stepItems} current={step} />}
      actions={actions}
    >
      {body}
    </StepsPattern>
  );
}
