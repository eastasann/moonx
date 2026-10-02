import type { AnswerType, TemplateVersionDetail } from "@moonx/schemas";
import {
  AlertDialog,
  Button,
  Flex,
  Heading,
  Picker,
  PickerItem,
  Stack,
  Switch,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type QuestionPatch,
  type TemplateQuestionNode,
  trackDraftSave,
  useDebouncedPatch,
  useTemplateWrites,
} from "../../lib/admin-templates";
import {
  ANSWER_TYPES,
  copyFromTooLong,
  isValidQuestionKey,
  linesOf,
  questionKeyShape,
} from "../../lib/template-edit";
import { ConditionEditor } from "./ConditionEditor";
import { answerTypeLabel } from "./labels";
import { OptionsEditor } from "./OptionsEditor";
import { QuestionPreview } from "./QuestionPreview";

const textOrNull = (value: string) => (value.trim() === "" ? null : value);

/**
 * The right pane for a question (design-spec 6.17 27). Text fields save after a pause; the answer
 * type, switches and condition save at once. An invalid key or an empty required field is not sent
 * and says why, so the draft never holds a value the API would refuse.
 */
export function QuestionEditor({
  detail,
  question,
  readOnly,
}: {
  detail: TemplateVersionDetail;
  question: TemplateQuestionNode;
  readOnly: boolean;
}) {
  const { t } = useTranslation("admin");
  const { patchQuestion } = useTemplateWrites(detail.id);
  const [values, setValues] = useState({
    key: question.key,
    title: question.title,
    prompt: question.prompt,
    example: question.example ?? "",
    hint: question.hint ?? "",
    copyFrom: Array.isArray(question.copyFrom) ? (question.copyFrom as string[]).join("\n") : "",
  });
  const [previewing, setPreviewing] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<AnswerType | null>(null);
  const send = (patch: QuestionPatch) => patchQuestion.mutateAsync({ id: question.id, patch });
  const saveNow = (patch: QuestionPatch) => void trackDraftSave(() => send(patch));
  const { schedule, flush } = useDebouncedPatch(send);

  const switchType = (type: AnswerType) => {
    flush();
    saveNow({ answerType: type, options: null });
  };

  const keyInvalid = !isValidQuestionKey(detail.kind, values.key);
  const errors = {
    title: values.title.trim() === "",
    prompt: values.prompt.trim() === "",
  };

  const change = (field: keyof typeof values, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    switch (field) {
      case "key":
        if (isValidQuestionKey(detail.kind, value)) schedule({ key: value });
        return;
      case "title":
      case "prompt":
        if (value.trim() !== "") schedule({ [field]: value.trim() });
        return;
      case "example":
      case "hint":
        schedule({ [field]: textOrNull(value) });
        return;
      case "copyFrom": {
        const lines = linesOf(value);
        if (copyFromTooLong(lines)) return;
        schedule({ copyFrom: lines.length === 0 ? null : lines });
      }
    }
  };

  const otherQuestions = detail.sections
    .flatMap((section) => section.questions)
    .filter((candidate) => candidate.id !== question.id);

  return (
    <Stack gap="space-300">
      <Flex justify="between" align="center" gap="space-200" wrap>
        <Heading level={2}>{t("edit.question.heading", { key: question.key })}</Heading>
        <Button variant="secondary" size="S" onPress={() => setPreviewing(true)}>
          {t("edit.question.preview")}
        </Button>
      </Flex>
      <TextField
        label={t("edit.question.key")}
        description={t("edit.question.keyHelp", { start: questionKeyShape(detail.kind) })}
        value={values.key}
        isReadOnly={readOnly}
        isInvalid={keyInvalid}
        errorMessage={
          keyInvalid
            ? t("edit.question.keyInvalid", { start: questionKeyShape(detail.kind) })
            : undefined
        }
        onChange={(value) => change("key", value)}
        onBlur={flush}
      />
      <TextField
        label={t("edit.question.title")}
        value={values.title}
        isRequired
        isReadOnly={readOnly}
        isInvalid={errors.title}
        errorMessage={errors.title ? t("edit.required") : undefined}
        onChange={(value) => change("title", value)}
        onBlur={flush}
      />
      <TextArea
        label={t("edit.question.prompt")}
        value={values.prompt}
        isRequired
        isReadOnly={readOnly}
        isInvalid={errors.prompt}
        errorMessage={errors.prompt ? t("edit.required") : undefined}
        onChange={(value) => change("prompt", value)}
        onBlur={flush}
      />
      <TextArea
        label={t("edit.question.example")}
        value={values.example}
        isReadOnly={readOnly}
        onChange={(value) => change("example", value)}
        onBlur={flush}
      />
      <TextArea
        label={t("edit.question.hint")}
        value={values.hint}
        isReadOnly={readOnly}
        onChange={(value) => change("hint", value)}
        onBlur={flush}
      />
      <Picker
        label={t("edit.question.answerType")}
        value={question.answerType}
        isDisabled={readOnly}
        onChange={(next) => {
          const type = ANSWER_TYPES.find((candidate) => candidate === next);
          if (!type || type === question.answerType) return;
          if (question.options) setSwitchingTo(type);
          else switchType(type);
        }}
      >
        {ANSWER_TYPES.map((type) => (
          <PickerItem key={type} id={type}>
            {answerTypeLabel(t, type)}
          </PickerItem>
        ))}
      </Picker>
      <OptionsEditor
        // A type switch resets the options, so the editor starts from the new type's blank state.
        key={question.answerType}
        question={question}
        readOnly={readOnly}
        onSave={(options) => send({ options })}
      />
      <ConditionEditor
        question={question}
        others={otherQuestions}
        readOnly={readOnly}
        onSave={(displayCondition) => send({ displayCondition })}
      />
      {detail.kind === "validation" ? (
        <Switch
          isSelected={question.hasFau}
          isDisabled={readOnly}
          onChange={(hasFau) => saveNow({ hasFau })}
          description={t("edit.question.fauHelp")}
        >
          {t("edit.question.fau")}
        </Switch>
      ) : null}
      {detail.kind === "business_plan" ? (
        <TextArea
          label={t("edit.question.copyFrom")}
          description={t("edit.question.copyFromHelp")}
          value={values.copyFrom}
          isInvalid={copyFromTooLong(linesOf(values.copyFrom))}
          errorMessage={
            copyFromTooLong(linesOf(values.copyFrom))
              ? t("edit.question.copyFromTooLong")
              : undefined
          }
          isReadOnly={readOnly}
          onChange={(value) => change("copyFrom", value)}
          onBlur={flush}
        />
      ) : null}
      <AlertDialog
        isOpen={switchingTo !== null}
        title={t("edit.question.switchTitle")}
        primaryActionLabel={t("edit.question.switchConfirm")}
        cancelLabel={t("app:cancel")}
        onPrimaryAction={() => {
          if (switchingTo) switchType(switchingTo);
          setSwitchingTo(null);
        }}
        onCancel={() => setSwitchingTo(null)}
        onOpenChange={(open) => !open && setSwitchingTo(null)}
      >
        {t("edit.question.switchBody")}
      </AlertDialog>
      <QuestionPreview
        isOpen={previewing}
        onClose={() => setPreviewing(false)}
        question={{
          title: values.title,
          prompt: values.prompt,
          example: textOrNull(values.example),
          hint: textOrNull(values.hint),
          answerType: question.answerType,
          options: question.options,
        }}
      />
    </Stack>
  );
}
