import { formatList } from "@moonx/i18n";
import {
  type AnswerType,
  answerTypeSchema,
  type TemplateVersionDetail,
} from "@moonx/schemas";
import {
  AlertDialog,
  Button,
  ButtonGroup,
  ContextualHelp,
  Dialog,
  Disclosure,
  FauButtons,
  Flex,
  Form,
  Heading,
  NumberField,
  QuestionCard,
  QuestionList,
  QuestionListItem,
  Radio,
  RadioGroup,
  Stack,
  TableView,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, inPath, unwrap } from "../lib/api";
import { useAppForm, useOneAtATime, useRejectedFields } from "../lib/form";
import { useIsOnline } from "../lib/online";
import { isSessionLost, useSendThrough } from "../lib/send";
import {
  answerTypesFor,
  promptSchema,
  putVersion,
  type Question,
  questionKeyIssues,
  type Section,
  sectionKeyIssues,
  suggestedQuestionKey,
  titleSchema,
} from "../lib/template-drafts";
import { ModalSendFailure } from "./ModalFailure";
import { useWorkspace } from "./workspace";

// The dialogs of 27's draft (design-spec 6.17「追加」「削除」「プレビュー」).

/** The words of a node by the kind: a plan's are items and prompts. */
const wordsOf = (version: TemplateVersionDetail) =>
  version.kind === "business_plan" ? "plan" : "other";

/**
 * Add section (a plan's Add item): its key and title, the fields AD4 needs; the new
 * section goes last (AD4) and is chosen.
 */
export function AddSectionDialog({
  version,
  onClose,
  onAdded,
}: {
  version: TemplateVersionDetail;
  onClose: () => void;
  onAdded: (sectionId: string) => void;
}) {
  const { t } = useTranslation(["admin"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const formId = useId();
  const sendThrough = useSendThrough();
  const oneAtATime = useOneAtATime();
  const rejections = useRejectedFields(["key", "title"] as const);
  const [failure, setFailure] = useState<unknown>(null);
  const words = wordsOf(version);
  const form = useAppForm({
    defaultValues: { key: "", title: "" },
    listeners: {
      onChange: ({ fieldApi }) => rejections.clear(fieldApi.name),
    },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        setFailure(null);
        rejections.clear();
        try {
          const updated = await sendThrough(() =>
            unwrap(
              api()
                .api.v1.admin["template-versions"]({
                  versionId: inPath(version.id),
                })
                .sections.post({ key: value.key, title: value.title }),
            ),
          );
          putVersion(queryClient, updated);
          const added = updated.sections.find(
            (section) => section.key === value.key,
          );
          if (added !== undefined) onAdded(added.id);
          onClose();
        } catch (error) {
          if (isSessionLost(error) || rejections.reject(error)) return;
          setFailure(error);
        }
      }),
  });
  const keyCheck = ({ value }: { value: string }) =>
    sectionKeyIssues(version, null, value)[0];
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      size="M"
      density="spacious"
      title={t(`admin:version.add.sectionTitle.${words}`)}
      buttons={
        <form.AppForm>
          <ButtonGroup align="end">
            <Button variant="secondary" onPress={onClose}>
              {t("admin:version.cancel")}
            </Button>
            <form.SubmitButton form={formId} isDisabled={!isOnline}>
              {t(`admin:version.add.section.${words}`)}
            </form.SubmitButton>
          </ButtonGroup>
        </form.AppForm>
      }
    >
      <form.AppForm>
        <Form id={formId} onSubmit={() => void form.handleSubmit()}>
          <form.AppField
            name="key"
            validators={{ onMount: keyCheck, onChange: keyCheck }}
          >
            {(field) => (
              <field.TextField
                rejection={rejections.rejectionOf("key")}
                label={t("admin:version.section.key")}
                width="full"
                isRequired
                isReadOnly={!isOnline}
                autoFocus
              />
            )}
          </form.AppField>
          <form.AppField
            name="title"
            validators={{ onMount: titleSchema, onChange: titleSchema }}
          >
            {(field) => (
              <field.TextField
                rejection={rejections.rejectionOf("title")}
                label={t("admin:version.section.title")}
                width="full"
                isRequired
                isReadOnly={!isOnline}
              />
            )}
          </form.AppField>
          {failure !== null && (
            <ModalSendFailure
              error={failure}
              onRetry={() => void form.handleSubmit()}
              isRetryDisabled={!isOnline}
              onClose={onClose}
            />
          )}
        </Form>
      </form.AppForm>
    </Dialog>
  );
}

/**
 * Add question (a plan's Add prompt) to `section`: its ID, title, question and answer
 * type, the fields AD4 needs. The ID starts as the one after the section's last
 * (design-spec 6.17). The new question goes last in the section (AD4) and is chosen.
 */
export function AddQuestionDialog({
  version,
  section,
  onClose,
  onAdded,
}: {
  version: TemplateVersionDetail;
  section: Section;
  onClose: () => void;
  onAdded: (questionId: string) => void;
}) {
  const { t } = useTranslation(["admin"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const formId = useId();
  const sendThrough = useSendThrough();
  const oneAtATime = useOneAtATime();
  const rejections = useRejectedFields(["key", "title", "prompt"] as const);
  const [failure, setFailure] = useState<unknown>(null);
  const words = wordsOf(version);
  const types = answerTypesFor(version.kind);
  const form = useAppForm({
    defaultValues: {
      key: suggestedQuestionKey(section),
      title: "",
      prompt: "",
      answerType: "long_text" as string,
    },
    listeners: {
      onChange: ({ fieldApi }) => rejections.clear(fieldApi.name),
    },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        setFailure(null);
        rejections.clear();
        // The Picker offers only answer types.
        const answerType: AnswerType = answerTypeSchema.parse(value.answerType);
        try {
          const updated = await sendThrough(() =>
            unwrap(
              api()
                .api.v1.admin["template-sections"]({ id: inPath(section.id) })
                .questions.post({
                  key: value.key,
                  title: value.title,
                  prompt: value.prompt,
                  answerType,
                }),
            ),
          );
          putVersion(queryClient, updated);
          const added = updated.sections
            .flatMap((entry) => entry.questions)
            .find((question) => question.key === value.key);
          if (added !== undefined) onAdded(added.id);
          onClose();
        } catch (error) {
          if (isSessionLost(error) || rejections.reject(error)) return;
          setFailure(error);
        }
      }),
  });
  const keyCheck = ({ value }: { value: string }) =>
    questionKeyIssues(version, null, value)[0];
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      size="M"
      density="spacious"
      title={t(`admin:version.add.questionTitle.${words}`, {
        section: section.title,
      })}
      buttons={
        <form.AppForm>
          <ButtonGroup align="end">
            <Button variant="secondary" onPress={onClose}>
              {t("admin:version.cancel")}
            </Button>
            <form.SubmitButton form={formId} isDisabled={!isOnline}>
              {t(`admin:version.add.question.${words}`)}
            </form.SubmitButton>
          </ButtonGroup>
        </form.AppForm>
      }
    >
      <form.AppForm>
        <Form id={formId} onSubmit={() => void form.handleSubmit()}>
          <form.AppField
            name="key"
            validators={{ onMount: keyCheck, onChange: keyCheck }}
          >
            {(field) => (
              <field.TextField
                rejection={rejections.rejectionOf("key")}
                label={t("admin:version.question.key")}
                description={t(
                  `admin:version.question.keyForm.${version.kind}`,
                )}
                width="full"
                isRequired
                isReadOnly={!isOnline}
                autoFocus
              />
            )}
          </form.AppField>
          <form.AppField
            name="title"
            validators={{ onMount: titleSchema, onChange: titleSchema }}
          >
            {(field) => (
              <field.TextField
                rejection={rejections.rejectionOf("title")}
                label={t("admin:version.question.title")}
                width="full"
                isRequired
                isReadOnly={!isOnline}
              />
            )}
          </form.AppField>
          <form.AppField
            name="prompt"
            validators={{ onMount: promptSchema, onChange: promptSchema }}
          >
            {(field) => (
              <field.TextArea
                rejection={rejections.rejectionOf("prompt")}
                label={t("admin:version.question.prompt")}
                width="full"
                isRequired
                isReadOnly={!isOnline}
              />
            )}
          </form.AppField>
          <form.AppField name="answerType">
            {(field) => (
              <field.Picker
                label={t("admin:version.question.answerType")}
                items={types.map((type) => ({
                  id: type,
                  label: t(`admin:answerType.${type}`),
                }))}
                isRequired
                isDisabled={!isOnline}
              />
            )}
          </form.AppField>
          {failure !== null && (
            <ModalSendFailure
              error={failure}
              onRetry={() => void form.handleSubmit()}
              isRetryDisabled={!isOnline}
              onClose={onClose}
            />
          )}
        </Form>
      </form.AppForm>
    </Dialog>
  );
}

/** What Delete asks about: a section with its questions, or a question. */
export type DeleteTarget =
  | { kind: "section"; section: Section }
  | { kind: "question"; question: Question };

/**
 * Asks before a section (with its questions) or a question is deleted (design-spec 6.17
 * 「削除」): a template's edits keep no history, so it cannot be undone.
 */
export function DeleteNodeDialog({
  version,
  target,
  onDelete,
  onClose,
}: {
  version: TemplateVersionDetail;
  target: DeleteTarget;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["admin"]);
  const words = wordsOf(version);
  const name =
    target.kind === "section"
      ? t("admin:version.sectionName", {
          key: target.section.key,
          title: target.section.title,
        })
      : t("admin:version.questionName", {
          key: target.question.key,
          title: target.question.title,
        });
  return (
    <AlertDialog
      isOpen
      variant="destructive"
      size="S"
      title={t("admin:version.delete.title", { name })}
      primaryActionLabel={t("admin:version.delete.action")}
      cancelLabel={t("admin:version.cancel")}
      autoFocusButton="cancel"
      onPrimaryAction={() => {
        onClose();
        onDelete();
      }}
      onCancel={onClose}
    >
      {target.kind === "section"
        ? t(`admin:version.delete.sectionBody.${words}`, {
            count: target.section.questions.length,
          })
        : t("admin:version.delete.questionBody")}
    </AlertDialog>
  );
}

/**
 * Preview (design-spec 6.17「プレビュー」): the section as 11 shows it, with 11's parts,
 * read only: its title, subtitle and guidance, then every question open with its answer
 * field in its type's shape (a plan's table as its columns with no rows), EXAMPLE and
 * Hint. A question shown on a condition says so, as the preview shows them all. A plan's
 * key numbers and execution list are told in a line: 21 draws them from a validation and
 * a plan, which a template does not have.
 */
export function PreviewDialog({
  version,
  section,
  onClose,
}: {
  version: TemplateVersionDetail;
  section: Section;
  onClose: () => void;
}) {
  const { t } = useTranslation(["admin", "validation"]);
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable
      size="L"
      title={t("admin:version.preview.title", { section: section.title })}
    >
      <Stack gap="space-300">
        <Stack gap="space-100">
          <Heading level={3}>{section.title}</Heading>
          {section.subtitle !== null && (
            <Text tone="secondary" elementType="p">
              {section.subtitle}
            </Text>
          )}
          {section.guidance !== null && (
            <Text tone="secondary" elementType="p">
              {section.guidance}
            </Text>
          )}
        </Stack>
        {section.questions.length === 0 ? (
          <Text tone="tertiary">
            {t(`admin:version.preview.empty.${wordsOf(version)}`)}
          </Text>
        ) : (
          <QuestionList>
            {section.questions.map((question) => (
              <QuestionListItem key={question.id}>
                <QuestionCard
                  title={question.title}
                  question={question.prompt}
                  mode="open"
                  headingLevel={4}
                >
                  <PreviewAnswer question={question} />
                </QuestionCard>
              </QuestionListItem>
            ))}
          </QuestionList>
        )}
      </Stack>
    </Dialog>
  );
}

/** A question's answer as 11 lays it out, read only (design-spec 6.2's table of types). */
function PreviewAnswer({ question }: { question: Question }) {
  const { t } = useTranslation(["admin", "validation"]);
  const { workspace } = useWorkspace();
  const answerLabel = t("validation:questions.answerLabel", {
    title: question.title,
  });
  const placeholder = t("validation:questions.placeholder");
  const { options } = question;
  let field: ReactNode;
  switch (question.answerType) {
    case "short_text":
      field = (
        <TextField
          aria-label={answerLabel}
          placeholder={placeholder}
          width="full"
          isReadOnly
        />
      );
      break;
    case "choice":
      field = (
        <RadioGroup
          aria-label={answerLabel}
          orientation="horizontal"
          isReadOnly
        >
          {(options?.kind === "choice" ? options.choices : []).map((choice) => (
            <Radio key={choice} value={choice}>
              {choice}
            </Radio>
          ))}
        </RadioGroup>
      );
      break;
    case "amount_with_reason":
      field = (
        <Stack gap="space-200">
          <NumberField
            label={t("admin:version.preview.amount")}
            currency={workspace.currency}
            isReadOnly
          />
          <TextArea
            label={t("admin:version.preview.why")}
            placeholder={placeholder}
            width="full"
            isReadOnly
          />
        </Stack>
      );
      break;
    case "table": {
      // 21 draws a table prompt from its columns: here with no rows.
      const columns = options?.kind === "table" ? options.columns : [];
      field =
        columns.length === 0 ? (
          <Text tone="secondary">{t("admin:version.preview.noColumns")}</Text>
        ) : (
          <TableView
            aria-label={answerLabel}
            columns={columns.map((column, index) => ({
              id: column.key,
              name: column.label,
              isRowHeader: index === 0,
              numeric: column.type !== "text",
            }))}
            items={[] as { id: string }[]}
            renderCell={() => null}
            renderEmptyState={() => (
              <Text tone="tertiary">{t("validation:questions.empty")}</Text>
            )}
          />
        );
      break;
    }
    case "linked_metric":
      field = (
        <Text tone="secondary">
          {t("admin:version.preview.metrics", {
            metrics: formatList(
              options?.kind === "linked_metric" ? options.metricKeys : [],
            ),
          })}
        </Text>
      );
      break;
    case "execution_view":
      field = (
        <Text tone="secondary">
          {options?.kind === "execution_view"
            ? t("admin:version.preview.execution", {
                list: t(`admin:executionType.${options.executionType}`),
              })
            : t("admin:version.preview.executionNone")}
        </Text>
      );
      break;
    default:
      field = (
        <TextArea
          aria-label={answerLabel}
          placeholder={placeholder}
          width="full"
          isReadOnly
        />
      );
  }
  const conditions = Object.entries(question.displayCondition ?? {});
  return (
    <>
      {field}
      {question.hasFau && (
        // Disabled: the preview takes no answer, so its choices never fire.
        <FauButtons
          aria-label={t("validation:questions.fau", { title: question.title })}
          state="empty"
          confidence={null}
          hasValue={false}
          onChange={() => {}}
          onFactPress={() => {}}
          isDisabled
        />
      )}
      {conditions.map(([key, values]) => (
        <Text key={key} variant="caption" tone="secondary" elementType="p">
          {t("admin:version.preview.shownWhen", {
            condition: t("admin:version.question.condition", {
              key,
              values: formatList(values),
            }),
          })}
        </Text>
      ))}
      {(question.example !== null || question.hint !== null) && (
        <Flex wrap columnGap="space-200" alignItems="center">
          {question.example !== null && (
            <Disclosure
              title={t("validation:questions.example")}
              isQuiet
              defaultExpanded
            >
              <Text variant="body-long" elementType="p">
                {question.example}
              </Text>
            </Disclosure>
          )}
          {question.hint !== null && (
            <ContextualHelp
              label={t("validation:questions.hint")}
              aria-label={t("validation:questions.hintFor", {
                title: question.title,
              })}
              title={t("validation:questions.hint")}
              size="S"
            >
              {question.hint}
            </ContextualHelp>
          )}
        </Flex>
      )}
    </>
  );
}
