import type { AnswerType, TemplateKind } from "@moonx/schemas";
import {
  Button,
  Dialog,
  Form,
  InlineAlert,
  Picker,
  PickerItem,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTemplateWrites } from "../../lib/admin-templates";
import { errorText } from "../../lib/error-text";
import {
  ANSWER_TYPES,
  isValidQuestionKey,
  questionKeyShape,
  questionKeyStart,
  SECTION_KEY_PATTERN,
} from "../../lib/template-edit";
import { answerTypeLabel } from "./labels";

export type NewNode =
  | { type: "section" }
  | { type: "question"; sectionId: string; sectionKey: string };

/**
 * The sheet that adds a section or a question to the draft (design-spec 6.17 27). The new node
 * needs the fields the API requires; the rest is edited in the pane afterwards. The ID's form is
 * checked here and again by the API, so a rejected ID shows the API's reason.
 */
export function NewNodeDialog({
  versionId,
  kind,
  node,
  onClose,
  onCreated,
}: {
  versionId: string;
  kind: TemplateKind;
  node: NewNode;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation(["admin", "app"]);
  const formId = useId();
  const { addSection, addQuestion } = useTemplateWrites(versionId);
  const isSection = node.type === "section";
  const [key, setKey] = useState(
    node.type === "question" ? questionKeyStart(kind, node.sectionKey) : "",
  );
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [part, setPart] = useState<"a" | "b" | null>(null);
  const [answerType, setAnswerType] = useState<AnswerType>("long_text");
  const [submitted, setSubmitted] = useState(false);

  const create = isSection ? addSection : addQuestion;
  const keyValid = isSection ? SECTION_KEY_PATTERN.test(key) : isValidQuestionKey(kind, key);
  const partNeeded = isSection && kind === "business_plan";
  const valid =
    keyValid &&
    title.trim() !== "" &&
    (isSection || prompt.trim() !== "") &&
    (!partNeeded || part !== null);

  const submit = () => {
    setSubmitted(true);
    if (!valid) return;
    if (node.type === "section") {
      addSection.mutate(
        { key, title: title.trim(), ...(partNeeded ? { part } : {}) },
        { onSuccess: (section) => onCreated(section.id) },
      );
    } else {
      addQuestion.mutate(
        {
          sectionId: node.sectionId,
          body: { key, title: title.trim(), prompt: prompt.trim(), answerType },
        },
        { onSuccess: (question) => onCreated(question.id) },
      );
    }
  };

  const required = (blank: boolean) => (submitted && blank ? t("admin:edit.required") : undefined);

  return (
    <Dialog
      isOpen
      isDismissable
      isKeyboardDismissDisabled={create.isPending}
      size="medium"
      title={isSection ? t("admin:edit.add.sectionTitle") : t("admin:edit.add.questionTitle")}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && onClose()}
      actions={
        <>
          <Button variant="secondary" onPress={onClose}>
            {t("app:cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="accent"
            isPending={create.isPending}
            pendingLabel={t("app:saving")}
          >
            {t("admin:edit.add.create")}
          </Button>
        </>
      }
    >
      <Form
        aria-label={
          isSection ? t("admin:edit.add.sectionTitle") : t("admin:edit.add.questionTitle")
        }
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {create.error ? (
          <InlineAlert variant="negative" heading={errorText(t, create.error)} />
        ) : null}
        <TextField
          label={isSection ? t("admin:edit.section.key") : t("admin:edit.question.key")}
          description={
            isSection
              ? t("admin:edit.section.keyHelp")
              : t("admin:edit.question.keyHelp", { start: questionKeyShape(kind) })
          }
          value={key}
          isRequired
          autoFocus
          isInvalid={submitted && !keyValid}
          errorMessage={
            submitted && !keyValid
              ? isSection
                ? t("admin:edit.section.keyInvalid")
                : t("admin:edit.question.keyInvalid", { start: questionKeyShape(kind) })
              : undefined
          }
          onChange={setKey}
        />
        <TextField
          label={isSection ? t("admin:edit.section.title") : t("admin:edit.question.title")}
          value={title}
          isRequired
          isInvalid={submitted && title.trim() === ""}
          errorMessage={required(title.trim() === "")}
          onChange={setTitle}
        />
        {partNeeded ? (
          <Picker
            label={t("admin:edit.section.part")}
            value={part}
            isRequired
            isInvalid={submitted && part === null}
            errorMessage={required(part === null)}
            onChange={(next) => setPart(next === "a" || next === "b" ? next : null)}
          >
            <PickerItem id="a">{t("admin:edit.section.partA")}</PickerItem>
            <PickerItem id="b">{t("admin:edit.section.partB")}</PickerItem>
          </Picker>
        ) : null}
        {isSection ? null : (
          <>
            <TextArea
              label={t("admin:edit.question.prompt")}
              value={prompt}
              isRequired
              isInvalid={submitted && prompt.trim() === ""}
              errorMessage={required(prompt.trim() === "")}
              onChange={setPrompt}
            />
            <Picker
              label={t("admin:edit.question.answerType")}
              value={answerType}
              onChange={(next) =>
                setAnswerType(ANSWER_TYPES.find((type) => type === next) ?? "long_text")
              }
            >
              {ANSWER_TYPES.map((type) => (
                <PickerItem key={type} id={type}>
                  {answerTypeLabel(t, type)}
                </PickerItem>
              ))}
            </Picker>
          </>
        )}
      </Form>
    </Dialog>
  );
}
