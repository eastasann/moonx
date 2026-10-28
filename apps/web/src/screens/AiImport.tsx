import {
  type AiScope,
  formatAmount,
  hasText,
  type MatchedBlock,
  matchBlocks,
  parseAiReply,
  type ReplyBody,
} from "@moonx/domain";
import { formatRelativeTime } from "@moonx/i18n";
import {
  AI_FILE_MAX_BYTES,
  AI_PASTE_MAX_CHARS,
  countChars,
  type ImportChange,
  type ImportContext,
  type TemplateKind,
} from "@moonx/schemas";
import {
  Button,
  Checkbox,
  ComboBox,
  DescriptionList,
  DescriptionListItem,
  DiffText,
  DiffTextArea,
  Disclosure,
  Divider,
  FauButtons,
  type FauChange,
  FileTrigger,
  Flex,
  Heading,
  IllustratedMessage,
  InlineAlert,
  MoonGlyph,
  Stack,
  Steps,
  StepsPattern,
  Text,
  TextArea,
  TextField,
  ToastQueue,
  useFauLabel,
  Well,
} from "@moonx/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, FileCheck, FileUp } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { type AiTarget, AiTargetScreen } from "../components/AiTargetScreen";
import { answerKey, moonOf } from "../components/AnswerFields";
import { ModalBoundary } from "../components/ErrorBoundary";
import { EvidenceSheet } from "../components/EvidenceSheet";
import { rateLimitWords } from "../components/SendFailure";
import { reportOnce } from "../components/states";
import { useModal, useWorkspace } from "../components/workspace";
import { parseScope } from "../lib/ai";
import {
  type BlockChoice,
  type ContextQuestion,
  changeOf,
  choosable,
  type Draft,
  draftOf,
  initialChoice,
  isValid,
  type Reviewed,
  type Row,
  review,
  rowsOf,
} from "../lib/ai-import";
import { ApiError, api, unwrap } from "../lib/api";
import { rejectionReason } from "../lib/autosave";
import { countingEvidence } from "../lib/evidence";
import { readUtf8 } from "../lib/files";
import { useIsOnline } from "../lib/online";
import { importContextQuery } from "../lib/queries";

/** `/w/$workspaceId/ai/import`'s search parameters (SDD 4章). */
export interface AiImportSearch {
  target?: TemplateKind;
  id?: string;
  scope?: string;
  returnTo?: string;
}

/** 25's steps (design-spec 6.7). ④ Apply is the button that ends ③. */
const STEPS = ["paste", "match", "review", "apply"] as const;
type Step = Exclude<(typeof STEPS)[number], "apply">;

/** How long "2 answers updated · 1 needs F/A/U" stays: the shortest 4.5 Toast allows. */
const TOAST_MS = 5000;

/** How much of a block without an ID ② quotes to name it. */
const EXCERPT_CHARS = 40;

/** The title and where the import goes, above the steps (s25-import.html .eyebrow). */
function Header({ eyebrow }: { eyebrow: ReactNode }) {
  const { t } = useTranslation(["ai"]);
  return (
    <Stack gap="space-75">
      <Text variant="caption" tone="secondary">
        {eyebrow}
      </Text>
      <Heading level={1} variant="heading-1-steps">
        {t("ai:import.title")}
      </Heading>
    </Stack>
  );
}

function ImportSteps({ current }: { current: Step }) {
  const { t } = useTranslation(["ai"]);
  return (
    <Steps
      aria-label={t("ai:steps")}
      steps={STEPS.map((id) => ({ id, label: t(`ai:import.step.${id}`) }))}
      currentId={current}
      doneLabel={t("ai:stepDone")}
    />
  );
}

/** 25's shape while its target loads (design-spec 6.0.6). */
export function AiImportSkeleton() {
  const { t } = useTranslation(["ai"]);
  return (
    <StepsPattern
      header={<Header eyebrow={t("ai:import.reply")} />}
      steps={<ImportSteps current="paste" />}
    >
      <Well>
        <Stack gap="space-100">
          {[0, 1, 2, 3].map((line) => (
            <Text key={line}>{t("ai:import.replyPlaceholder")}</Text>
          ))}
        </Stack>
      </Well>
    </StepsPattern>
  );
}

/** A block's first line, to name a block without an ID ("Unmatched block “…”"). */
function excerptOf(body: ReplyBody, truncate: (text: string) => string) {
  const text =
    body.kind === "markdown"
      ? body.text
      : [body.text, body.reason, body.amount]
          .map((value) =>
            value === undefined || value === null ? "" : String(value),
          )
          .find((value) => value.trim() !== "");
  const line = (text ?? "").trim().split("\n")[0]?.trim() ?? "";
  const chars = Array.from(line);
  return chars.length > EXCERPT_CHARS
    ? truncate(chars.slice(0, EXCERPT_CHARS).join("").trimEnd())
    : line;
}

/** One block of the reply in ② (design-spec 6.7 ②): what it is, why, and what to do. */
function BlockRow({
  row,
  context,
  items,
  onChange,
}: {
  row: Row;
  context: ImportContext;
  items: { id: string; label: string; description: string }[];
  onChange: (choice: BlockChoice | "keep") => void;
}) {
  const { t } = useTranslation(["ai"]);
  const discardId = useId();
  const { block, status } = row;
  const named =
    block.id === null
      ? undefined
      : context.questions.find((question) => question.questionKey === block.id);
  const name =
    block.id === null
      ? t("ai:import.match.unnamed", {
          excerpt: excerptOf(block.body, (text) =>
            t("ai:import.match.truncated", { text }),
          ),
        })
      : named === undefined
        ? t("ai:import.match.id", { id: block.id })
        : t("ai:import.match.named", { id: block.id, title: named.title });
  const message = {
    matched: t("ai:import.match.matched"),
    duplicate: t("ai:import.match.duplicate"),
    unmatched: t("ai:import.match.unmatched"),
    unknownId: t("ai:import.match.unknownId", { id: block.id ?? "" }),
    outOfScope: t("ai:import.match.outOfScope"),
    hidden: t("ai:import.match.hidden"),
    notImportable: t("ai:import.match.notImportable"),
    emptyFor: t("ai:import.match.emptyFor"),
    discarded: t("ai:import.match.discarded"),
  }[status];
  const isQuiet =
    status === "matched" ||
    status === "notImportable" ||
    status === "discarded";
  const canChoose = status !== "notImportable" && status !== "discarded";
  return (
    <Flex
      justifyContent="space-between"
      alignItems="center"
      gap="space-200"
      wrap
    >
      <Stack gap="space-50">
        <Text variant="label">{name}</Text>
        <Text variant="body-sm" tone={isQuiet ? "secondary" : "notice"}>
          {message}
        </Text>
      </Stack>
      <Flex gap="space-100" alignItems="center" wrap>
        {canChoose && (
          <ComboBox
            aria-label={t("ai:import.match.question", { block: name })}
            placeholder={t("ai:import.match.choose")}
            items={items}
            value={row.choice.questionKey}
            onChange={(questionKey) =>
              onChange({ questionKey, discarded: false })
            }
          />
        )}
        {status === "duplicate" && (
          <Button
            variant="secondary"
            onPress={() => {
              onChange("keep");
              // The row is Matched now and the button gone: focus stays in the row.
              requestAnimationFrame(() =>
                document.getElementById(discardId)?.focus(),
              );
            }}
          >
            {t("ai:import.match.useThis")}
          </Button>
        )}
        {status === "discarded" ? (
          <Button
            variant="secondary"
            isQuiet
            onPress={() => onChange({ ...row.choice, discarded: false })}
          >
            {t("ai:import.match.undo")}
          </Button>
        ) : (
          <Button
            id={discardId}
            variant="secondary"
            isQuiet
            onPress={() => onChange({ ...row.choice, discarded: true })}
          >
            {t("ai:import.match.discard")}
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

/**
 * "Couldn't apply" with Retry (design-spec 6.7「反映の失敗」): the reason a refusal names,
 * the wait of a rate limit, or the Ref of an unexpected failure. What was edited stays.
 */
function ApplyFailure({
  error,
  onRetry,
  isRetryDisabled,
}: {
  error: unknown;
  onRetry: () => void;
  isRetryDisabled: boolean;
}) {
  const { t } = useTranslation(["ai", "app"]);
  const rateLimited = rateLimitWords(error);
  const code = error instanceof ApiError ? error.code : null;
  const changed = code === "NOT_IMPORTABLE" || code === "QUESTION_NOT_FOUND";
  const reason =
    error instanceof ApiError && !changed ? rejectionReason(error) : null;
  const isTransient =
    error instanceof ApiError &&
    (error.status === null || error.code === "UPSTREAM_UNAVAILABLE");
  const isUnexpected =
    rateLimited === null && reason === null && !changed && !isTransient;
  const reference = useMemo(
    () =>
      !isUnexpected
        ? null
        : error instanceof ApiError
          ? error.requestId
          : reportOnce(error),
    [isUnexpected, error],
  );
  return (
    <InlineAlert variant="negative">
      <Flex gap="space-200" wrap alignItems="center">
        <Text>{t("ai:import.review.couldNotApply")}</Text>
        {rateLimited !== null && <Text tone="secondary">{rateLimited}</Text>}
        {changed && (
          <Text tone="secondary">{t("ai:import.review.questionsChanged")}</Text>
        )}
        {reason !== null && (
          <Text tone="secondary">{t(`app:save.reason.${reason}`)}</Text>
        )}
        {reference !== null && (
          <Text variant="caption" tone="secondary">
            {t("app:state.ref", { ref: reference.slice(0, 8) })}
          </Text>
        )}
        <Button
          variant="secondary"
          size="S"
          onPress={onRetry}
          isDisabled={isRetryDisabled}
        >
          {t("app:state.retry")}
        </Button>
      </Flex>
    </InlineAlert>
  );
}

function ImportFlow({
  target,
  scopeParam,
  modal,
  about,
}: {
  target: AiTarget;
  scopeParam: string | undefined;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { t } = useTranslation(["ai", "errors", "app"]);
  const { me } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const modals = useModal();
  const isOnline = useIsOnline();
  const fauLabel = useFauLabel();
  const forFact = useRouterState({
    select: (state) => state.location.state.evidenceForFact === true,
  });
  const { kind, id, context } = target;
  const isValidation = kind === "validation";
  const { currency } = context.target;
  const contextKey = importContextQuery(kind, id).queryKey;
  const [scope] = useState<AiScope>(() =>
    parseScope(kind, scopeParam, context.sections),
  );
  // The versions the answers had when 25 opened: one saved since by someone else shows
  // "Updated by …" (6.7 ③).
  const [opened] = useState(
    () =>
      new Map(
        context.questions.map((question) => [
          question.questionKey,
          question.current.lockVersion,
        ]),
      ),
  );
  const [step, setStep] = useState<Step>("paste");
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [noIds, setNoIds] = useState(false);
  const [blocks, setBlocks] = useState<MatchedBlock[]>([]);
  const [choices, setChoices] = useState<BlockChoice[]>([]);
  // What ② read for each question, and the same as edited on ③; the questions as they
  // were then, for one the template loses meanwhile (a migration).
  const [imported, setImported] = useState<Draft[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [asMatched, setAsMatched] = useState<
    ReadonlyMap<string, ContextQuestion>
  >(new Map());
  const [applyFirst, setApplyFirst] = useState<ReadonlySet<string>>(new Set());
  const [conflict, setConflict] = useState(false);
  // Whether 25 is still open when an apply settles, which may be later: a user who left
  // meanwhile is not taken back.
  const isOpen = useRef(true);
  useEffect(() => {
    isOpen.current = true;
    return () => {
      isOpen.current = false;
    };
  }, []);

  const questions = new Map(
    context.questions.map((question) => [question.questionKey, question]),
  );
  const codeOf = (question: ContextQuestion) =>
    t("ai:import.review.code", {
      section: question.sectionKey,
      title: question.title,
    });

  const apply = useMutation({
    mutationFn: (changes: ImportChange[]) =>
      unwrap(
        api().api.v1.ai.import.apply.post({
          target: { type: kind, ...(id === undefined ? {} : { id }) },
          changes,
        }),
      ),
    onSuccess: ({ applied, needsClassification }) => {
      // The answers show on many screens (13's checks and Next steps, 11, the
      // dashboard's activity): everything is read again.
      void queryClient.invalidateQueries();
      const updated =
        applied === 0
          ? t("ai:import.applied.nothing")
          : t("ai:import.applied.updated", { count: applied });
      ToastQueue.neutral(
        needsClassification === 0
          ? updated
          : [
              updated,
              t("ai:import.applied.needsFau", { count: needsClassification }),
            ].join(t("app:separator")),
        { timeout: TOAST_MS },
      );
      if (isOpen.current) void navigate({ href: target.returnHref });
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return;
      if (error.code === "CONFLICT_MULTI") setConflict(true);
      if (
        error.code === "CONFLICT_MULTI" ||
        error.code === "NOT_IMPORTABLE" ||
        error.code === "QUESTION_NOT_FOUND"
      ) {
        // Current shows the latest; what was edited stays (6.7「状態」).
        void queryClient.invalidateQueries({ queryKey: contextKey });
      }
    },
  });

  const header = <Header eyebrow={target.eyebrow} />;
  if (target.archived !== null) {
    // Nothing can be applied (X3 409 ARCHIVED): no field to paste into (6.7「状態」).
    return (
      <StepsPattern header={header} steps={<ImportSteps current="paste" />}>
        <InlineAlert>{t(`ai:archived.${target.archived}`)}</InlineAlert>
      </StepsPattern>
    );
  }

  const go = (next: Step) => {
    apply.reset();
    setConflict(false);
    setStep(next);
  };
  const toMatch = (matched: MatchedBlock[]) => {
    setBlocks(matched);
    setChoices(matched.map(initialChoice));
    setNoIds(false);
    go("match");
  };
  const readReply = () => {
    if (pasted.trim() === "") {
      setPasteError(t("errors:input.required"));
      return;
    }
    if (countChars(pasted) > AI_PASTE_MAX_CHARS) {
      setPasteError(t("ai:import.tooLong"));
      return;
    }
    const reply = parseAiReply(pasted);
    if (reply.blocks.every((block) => block.id === null)) {
      setNoIds(true);
      return;
    }
    toMatch(
      matchBlocks(
        reply,
        {
          sections: context.sections,
          questions: context.questions,
          currency,
        },
        scope,
      ),
    );
  };
  // "No question IDs found": the whole paste goes on as one unmatched block (6.7 ①).
  const continueWithoutIds = () =>
    toMatch([
      {
        index: 0,
        id: null,
        status: "unmatched",
        questionKey: null,
        answer: null,
        body: { kind: "markdown", text: pasted.trim() },
      },
    ]);
  const readFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (file === undefined) return;
    if (file.size > AI_FILE_MAX_BYTES) {
      setPasteError(t("ai:import.tooLong"));
      return;
    }
    const text = await readUtf8(file);
    if (text === null) {
      setPasteError(t("ai:import.unreadableFile"));
      return;
    }
    setPasted(text);
    setNoIds(false);
    setPasteError(
      countChars(text) > AI_PASTE_MAX_CHARS ? t("ai:import.tooLong") : null,
    );
  };

  const rows = rowsOf(blocks, choices, context, scope);
  const assigned = rows.filter((row) => row.status === "matched");
  const hasDuplicates = rows.some((row) => row.status === "duplicate");
  const items = choosable(context, scope).map((question) => ({
    id: question.questionKey,
    label: codeOf(question),
    description: question.prompt,
  }));
  const toReview = () => {
    // The order of the template, as the questions are asked (6.7 ③).
    const byKey = new Map(
      assigned.flatMap((row) =>
        row.question === null || row.answer === null
          ? []
          : [[row.question.questionKey, row.answer] as const],
      ),
    );
    const read = context.questions.flatMap((question) => {
      const answer = byKey.get(question.questionKey);
      return answer === undefined
        ? []
        : [draftOf(question.questionKey, answer, currency)];
    });
    setImported(read);
    setDrafts(read);
    setAsMatched(questions);
    setApplyFirst(new Set());
    // Current shows the answers as they are now (6.7 ③).
    void queryClient.invalidateQueries({ queryKey: contextKey });
    go("review");
  };

  const reviewed = drafts.flatMap((draft, index) => {
    const now = questions.get(draft.questionKey);
    const question = now ?? asMatched.get(draft.questionKey);
    const read = imported[index];
    if (question === undefined || read === undefined) return [];
    const isGone = now === undefined;
    const item = review(question, draft, currency, isGone);
    return [
      {
        ...item,
        // Listed by what was imported as well as by what is typed: an answer edited
        // until it reads as the answer now (or cleared, when there is none) stays where
        // it is instead of folding away under the user's hands. One gone from the
        // template stays, with why, until it is unchecked.
        isListed:
          isGone ||
          item.isChanged ||
          review(question, read, currency).isChanged,
      },
    ];
  });
  const changed = reviewed.filter((item) => item.isListed);
  const unchanged = reviewed.filter((item) => !item.isListed);
  // An answer edited back to the answer now writes nothing (X3 counts no such change).
  const toApply = changed.filter((item) => item.draft.apply && item.isChanged);
  const canApply =
    toApply.length > 0 &&
    toApply.every(isValid) &&
    isOnline &&
    !apply.isPending;
  const edit = (questionKey: string, change: Partial<Draft>) =>
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.questionKey !== questionKey) return draft;
        const next = { ...draft, ...change };
        // A text cleared clears its F/A/U but for Unknown (6.0.3), and takes none but
        // Unknown after: X3 refuses a Fact or an Assumption without a value.
        return next.text !== undefined &&
          next.text.trim() === "" &&
          next.classification !== null &&
          next.classification.fau !== "unknown"
          ? { ...next, classification: null }
          : next;
      }),
    );
  const back = () => void navigate({ href: target.returnHref });

  /** Fact on ③ (6.7 ③): kept evidence makes it a Fact; without any, M2 attaches some. */
  const pressFact = (item: Reviewed) => {
    const { questionKey, current } = item.question;
    if (!hasText(current.text)) {
      // V4 refuses a Fact for an answer with no value: the evidence comes after.
      setApplyFirst((keys) => new Set(keys).add(questionKey));
      return;
    }
    if (countingEvidence(current.classification?.evidence ?? []).length > 0) {
      edit(questionKey, { classification: { fau: "fact", confidence: null } });
      return;
    }
    modals.open("evidence", {
      about: `validation_answer:${id}:${questionKey}`,
      forFact: true,
    });
  };

  const comparisonOf = (item: Reviewed) => {
    const { question, draft } = item;
    const { current } = question;
    const code = codeOf(question);
    const isAmount = question.answerType === "amount_with_reason";
    const isLater =
      (opened.get(question.questionKey) ?? 0) !== current.lockVersion &&
      current.updatedBy?.id !== me.id &&
      current.updatedAt !== null;
    const when =
      current.updatedAt === null
        ? ""
        : formatRelativeTime(current.updatedAt, { timeZone: me.timezone });
    const state = current.classification?.state ?? null;
    const amountShown = (amount: number | null | undefined) =>
      amount === null || amount === undefined || currency === null
        ? ""
        : formatAmount(amount, currency);
    const importedText = draft.text ?? current.text ?? "";
    const chosen = draft.classification?.fau ?? null;
    const afterState =
      chosen ?? (hasText(item.text ?? null) ? "unclassified" : "empty");
    return {
      id: question.questionKey,
      select: (
        <Checkbox
          aria-label={t("ai:import.review.apply", { question: code })}
          isSelected={draft.apply}
          onChange={(selected) =>
            edit(question.questionKey, { apply: selected })
          }
        />
      ),
      code,
      question: question.prompt,
      meta: !isLater
        ? undefined
        : current.updatedBy === null
          ? t("ai:import.review.updatedBySomeone", { when })
          : t("ai:import.review.updatedBy", {
              name: current.updatedBy.displayName,
              when,
            }),
      before: (
        <>
          <Flex gap="space-100" alignItems="center" wrap>
            <Text variant="caption" tone="secondary">
              {t("ai:import.review.current")}
            </Text>
            {question.hasFau && state !== null && (
              <Flex gap="space-75" alignItems="center">
                <MoonGlyph state={moonOf[state]} size="S" />
                <Text variant="caption" tone="secondary">
                  {fauLabel(state, {
                    confidence: current.classification?.confidence ?? null,
                    evidenceCount: countingEvidence(
                      current.classification?.evidence ?? [],
                    ).length,
                  })}
                </Text>
              </Flex>
            )}
          </Flex>
          {isAmount && draft.amount !== undefined && (
            <DiffText
              variant="before"
              before={amountShown(current.amount)}
              after={
                item.amountError === null
                  ? amountShown(item.amount)
                  : draft.amount
              }
            />
          )}
          {(!isAmount || draft.text !== undefined) &&
            (hasText(current.text) ? (
              <DiffText
                variant="before"
                before={current.text ?? ""}
                after={importedText}
              />
            ) : (
              <Text variant="body-long" tone="tertiary">
                {t("ai:import.review.empty")}
              </Text>
            ))}
        </>
      ),
      after: (
        <>
          <Text variant="caption" tone="secondary">
            {t("ai:import.review.imported")}
            {t("ai:import.review.youCanEdit")}
          </Text>
          {isAmount && draft.amount !== undefined && (
            <TextField
              label={t("ai:import.review.amount")}
              value={draft.amount}
              onChange={(amount) => edit(question.questionKey, { amount })}
              errorMessage={item.amountError ?? undefined}
              isReadOnly={!isOnline}
            />
          )}
          {draft.text !== undefined && (
            <DiffTextArea
              label={isAmount ? t("ai:import.review.reason") : undefined}
              aria-label={
                isAmount
                  ? undefined
                  : t("ai:import.review.importedAnswer", { question: code })
              }
              before={current.text ?? ""}
              value={draft.text}
              onChange={(text) => edit(question.questionKey, { text })}
              errorMessage={item.textError ?? undefined}
              isReadOnly={!isOnline}
            />
          )}
          {question.hasFau && (
            <FauButtons
              aria-label={t("ai:import.review.fau", { question: code })}
              unclassified="label"
              state={afterState}
              confidence={draft.classification?.confidence ?? null}
              hasValue={hasText(item.text ?? null)}
              // A question hidden or gone takes no evidence or import until unchecked.
              isDisabled={!isOnline || item.questionError !== null}
              onChange={(change: FauChange) =>
                edit(question.questionKey, {
                  classification: change.fau === null ? null : change,
                })
              }
              onFactPress={() => pressFact(item)}
            />
          )}
          {applyFirst.has(question.questionKey) && (
            <Text variant="body-sm" tone="notice" elementType="p">
              {t("ai:import.review.applyFirst")}
            </Text>
          )}
          {item.questionError !== null && (
            <Text variant="body-sm" tone="negative" elementType="p">
              {item.questionError}
            </Text>
          )}
        </>
      ),
    };
  };

  // M2 from Fact (6.0.3): what it attaches saves the answer as a Fact at once.
  const evidenceFor = (() => {
    if (
      modal !== "evidence" ||
      step !== "review" ||
      !isValidation ||
      !forFact
    ) {
      return null;
    }
    const prefix = `validation_answer:${id}:`;
    if (about === undefined || !about.startsWith(prefix)) return null;
    const item = changed.find(
      (candidate) =>
        candidate.question.questionKey === about.slice(prefix.length),
    );
    return item === undefined || !hasText(item.question.current.text)
      ? null
      : item;
  })();
  const putCurrent = (
    questionKey: string,
    change: (current: ContextQuestion["current"]) => ContextQuestion["current"],
  ) =>
    queryClient.setQueryData<ImportContext>(contextKey, (data) =>
      data === undefined
        ? data
        : {
            ...data,
            questions: data.questions.map((question) =>
              question.questionKey === questionKey
                ? { ...question, current: change(question.current) }
                : question,
            ),
          },
    );

  let content: ReactNode;
  let actions: ReactNode;
  let comparisons: ReturnType<typeof comparisonOf>[] | undefined;
  let footer: ReactNode;
  let note: ReactNode;
  if (step === "paste") {
    const example = choosable(context, scope)[0]?.questionKey ?? "";
    content = (
      <Stack gap="space-300">
        <TextArea
          label={t("ai:import.reply")}
          placeholder={t("ai:import.replyPlaceholder")}
          value={pasted}
          onChange={(value) => {
            setPasted(value);
            setPasteError(null);
            setNoIds(false);
          }}
          errorMessage={pasteError ?? undefined}
          isRequired
          width="full"
        />
        <Flex gap="space-200" alignItems="center" wrap>
          <Text tone="secondary">{t("ai:import.or")}</Text>
          <FileTrigger
            acceptedFileTypes={[
              ".md",
              ".json",
              "text/markdown",
              "application/json",
              "text/plain",
            ]}
            onSelect={(files) => void readFile(files)}
          >
            <Button variant="secondary">
              <FileUp />
              {t("ai:import.upload")}
            </Button>
          </FileTrigger>
        </Flex>
        {noIds && (
          <InlineAlert variant="notice" title={t("ai:import.noIds")}>
            <Stack gap="space-200">
              <Text>{t("ai:import.expected")}</Text>
              <Well>
                <Text variant="body-long" elementType="div">
                  {[
                    t("ai:import.exampleHeading", { id: example }),
                    t("ai:import.expectedAnswer"),
                  ].join("\n")}
                </Text>
              </Well>
              <Flex>
                <Button variant="secondary" onPress={continueWithoutIds}>
                  {t("ai:import.continueAnyway")}
                </Button>
              </Flex>
            </Stack>
          </InlineAlert>
        )}
      </Stack>
    );
    actions = (
      <Button key="next" variant="primary" onPress={readReply}>
        {t("ai:nextStep")}
        <ArrowRight />
      </Button>
    );
  } else if (step === "match") {
    const isEmpty = assigned.length === 0 && !hasDuplicates;
    content = (
      <Stack gap="space-300">
        {isEmpty && (
          <InlineAlert variant="notice" title={t("ai:import.match.nothing")}>
            <Flex>
              <Button variant="secondary" onPress={() => go("paste")}>
                {t("ai:import.match.backToPaste")}
              </Button>
            </Flex>
          </InlineAlert>
        )}
        {hasDuplicates && (
          <InlineAlert variant="notice">
            {t("ai:import.match.duplicates")}
          </InlineAlert>
        )}
        {rows.length > 0 && (
          <Stack gap="space-200">
            <Divider />
            {rows.map((row, position) => (
              <Stack key={row.block.index} gap="space-200">
                <BlockRow
                  row={row}
                  context={context}
                  items={items}
                  // Choices go by the row's place: `block.index` is its place in the
                  // reply, which skips the empty blocks matching left out (6.7 ①).
                  onChange={(change) =>
                    setChoices((current) =>
                      current.map((choice, index) => {
                        if (change !== "keep") {
                          return index === position ? change : choice;
                        }
                        // "Use this one": the other blocks on its question go.
                        const other = rows[index];
                        return index !== position &&
                          other?.status === "duplicate" &&
                          other.question?.questionKey ===
                            row.question?.questionKey
                          ? { ...choice, discarded: true }
                          : choice;
                      }),
                    )
                  }
                />
                <Divider />
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
    );
    actions = (
      <>
        <Button key="back" variant="secondary" onPress={() => go("paste")}>
          <ArrowLeft />
          {t("ai:previousStep")}
        </Button>
        <Button
          key="next"
          variant="primary"
          onPress={toReview}
          isDisabled={isEmpty || hasDuplicates}
        >
          {t("ai:nextStep")}
          <ArrowRight />
        </Button>
      </>
    );
  } else if (changed.length === 0) {
    content = (
      <IllustratedMessage
        icon={<FileCheck />}
        heading={t("ai:import.review.noChanges")}
        actions={
          <Button variant="secondary" onPress={back}>
            {t("ai:import.review.close")}
          </Button>
        }
      >
        {t("ai:import.review.noChangesBody")}
      </IllustratedMessage>
    );
    actions = (
      <Button key="back" variant="secondary" onPress={() => go("match")}>
        <ArrowLeft />
        {t("ai:previousStep")}
      </Button>
    );
  } else {
    content = (
      <Stack gap="space-200">
        {conflict && (
          <InlineAlert variant="notice">
            {t("ai:import.review.conflict")}
          </InlineAlert>
        )}
        <Text variant="body-sm" tone="secondary">
          <strong>
            {t("ai:import.review.changes", { count: changed.length })}
          </strong>
          {isValidation
            ? t("ai:import.review.toApplyFau")
            : t("ai:import.review.toApply")}
        </Text>
      </Stack>
    );
    comparisons = changed.map(comparisonOf);
    footer = (
      <>
        {unchanged.length > 0 && (
          <Disclosure
            title={t("ai:import.review.unchanged", { count: unchanged.length })}
            headingLevel={2}
          >
            <DescriptionList>
              {unchanged.map(({ question }) => (
                <DescriptionListItem
                  key={question.questionKey}
                  label={codeOf(question)}
                >
                  {question.answerType === "amount_with_reason" &&
                  question.current.amount !== null &&
                  currency !== null
                    ? [
                        formatAmount(question.current.amount, currency),
                        question.current.text ?? "",
                      ]
                        .filter((part) => part !== "")
                        .join(t("app:separator"))
                    : (question.current.text ?? "")}
                </DescriptionListItem>
              ))}
            </DescriptionList>
          </Disclosure>
        )}
        {apply.isError && !conflict && (
          <ApplyFailure
            error={apply.error}
            onRetry={() => apply.mutate(toApply.map(changeOf))}
            isRetryDisabled={!canApply}
          />
        )}
      </>
    );
    note = t("ai:import.review.note");
    actions = (
      <>
        <Button key="cancel" variant="secondary" isQuiet onPress={back}>
          {t("ai:import.review.cancel")}
        </Button>
        <Button
          key="apply"
          variant="primary"
          onPress={() => {
            setConflict(false);
            apply.mutate(toApply.map(changeOf));
          }}
          isPending={apply.isPending}
          isDisabled={!canApply}
        >
          {t("ai:import.review.applyCount", { count: toApply.length })}
        </Button>
      </>
    );
  }

  return (
    <>
      <StepsPattern
        header={header}
        steps={<ImportSteps current={step} />}
        comparisons={comparisons}
        footer={footer}
        note={note}
        actions={actions}
        focusKey={step}
      >
        {content}
      </StepsPattern>
      {evidenceFor !== null && id !== undefined && (
        <ModalBoundary key="evidence" onClose={modals.close}>
          <EvidenceSheet
            ideaId={context.target.ideaId ?? ""}
            validationId={id}
            item={{
              target: {
                type: "validation_answer",
                id,
                key: evidenceFor.question.questionKey,
              },
              label: [
                codeOf(evidenceFor.question),
                evidenceFor.question.prompt,
              ].join(t("app:separator")),
              noun: t("ai:import.review.noun"),
              evidence:
                evidenceFor.question.current.classification?.evidence ?? [],
              state:
                evidenceFor.question.current.classification?.state ??
                "unclassified",
              hasValue: true,
            }}
            lockVersionNow={() =>
              queryClient
                .getQueryData<ImportContext>(contextKey)
                ?.questions.find(
                  (question) =>
                    question.questionKey === evidenceFor.question.questionKey,
                )?.current.lockVersion ??
              evidenceFor.question.current.lockVersion
            }
            saveKey={answerKey(id, evidenceFor.question.questionKey)}
            forFact
            onChanged={(result) => {
              const { questionKey } = evidenceFor.question;
              // Saved by the user: no "Updated by …" for it (6.7 ③).
              putCurrent(questionKey, (current) => ({
                ...current,
                classification: result.classification,
                lockVersion: result.lockVersion,
                updatedAt: new Date().toISOString(),
                updatedBy: {
                  id: me.id,
                  displayName: me.displayName,
                  avatarUrl: me.avatarUrl,
                  badge: null,
                },
              }));
              // Evidence attached from Fact saved the answer as a Fact (V4 setFact);
              // its last evidence removed again, it is not one any more (V5).
              const isFact = result.classification.fau === "fact";
              setDrafts((current) =>
                current.map((draft) =>
                  draft.questionKey !== questionKey
                    ? draft
                    : isFact
                      ? {
                          ...draft,
                          classification: { fau: "fact", confidence: null },
                        }
                      : draft.classification?.fau === "fact"
                        ? { ...draft, classification: null }
                        : draft,
                ),
              );
              void queryClient.invalidateQueries({ queryKey: contextKey });
            }}
            onMarkFact={() =>
              edit(evidenceFor.question.questionKey, {
                classification: { fau: "fact", confidence: null },
              })
            }
            onReload={() =>
              void queryClient.invalidateQueries({ queryKey: contextKey })
            }
            onClose={modals.close}
          />
        </ModalBoundary>
      )}
    </>
  );
}

/**
 * 25 Import from AI (design-spec 6.7, s25-import.html): pattern G. ① the reply pasted or
 * uploaded, ② each block put on its question by its ID, ③ each change beside the answer
 * it replaces, editable, and for a validation its F/A/U set again, then all applied at
 * once (X3) and back to where 25 was opened. Owners and Members only (a self-analysis
 * is its owner's); an archived idea or plan says so and offers nothing.
 */
export function AiImportScreen({
  search,
  modal,
  about,
}: {
  search: AiImportSearch;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { t } = useTranslation(["ai"]);
  return (
    <AiTargetScreen
      search={{ kind: search.target, id: search.id, returnTo: search.returnTo }}
      title={t("ai:import.title")}
      skeleton={<AiImportSkeleton />}
    >
      {(target) => (
        <ImportFlow
          target={target}
          scopeParam={search.scope}
          modal={modal}
          about={about}
        />
      )}
    </AiTargetScreen>
  );
}
