import { createIdeaBodySchema } from "@moonx/schemas";
import {
  Button,
  Dialog,
  Flex,
  Form,
  InlineAlert,
  Stack,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ConflictDialog } from "../../components/ConflictDialog";
import { autosave } from "../../lib/autosave";
import { errorText } from "../../lib/error-text";
import { validate } from "../../lib/form";
import { IDEAS_KEY } from "../../lib/idea-actions";
import { ME_KEY } from "../../lib/session";
import { useSavedItem } from "../../lib/use-saved-item";
import type { ValidationHomeData } from "../../lib/validation-home";

interface Values {
  name: string;
  oneLineConcept: string;
  proposedSolution: string;
}

type Field = keyof Values;

/** The summary as the 409 of I2 carries it in `current.value`. */
const currentValueSchema = z.object({
  name: z.string(),
  oneLineConcept: z.string(),
  proposedSolution: z.string().nullable(),
});

const toValues = (idea: {
  name: string;
  oneLineConcept: string;
  proposedSolution: string | null;
}): Values => ({
  name: idea.name,
  oneLineConcept: idea.oneLineConcept,
  proposedSolution: idea.proposedSolution ?? "",
});

/** The request body for one changed field; I2 stores a blank proposed solution as null. */
const bodyOf = (field: Field, value: string) =>
  field === "proposedSolution"
    ? { proposedSolution: value.trim() === "" ? null : value }
    : { [field]: value.trim() };

/**
 * The sheet that edits the idea's name, one-line concept and proposed solution (design-spec 6.1).
 * It has no Save button: each field saves by the autosave rules, and a field that fails the
 * check is not sent. When someone saved the summary first, the shared conflict choice opens
 * (design-spec 6.0.2).
 */
export function EditSummaryDialog({
  idea,
  onClose,
}: {
  idea: ValidationHomeData["idea"];
  onClose: () => void;
}) {
  const { t } = useTranslation(["validation", "form", "app"]);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => toValues(idea));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const fields: { name: Field; label: string }[] = [
    { name: "name", label: t("validation:home.edit.name") },
    { name: "oneLineConcept", label: t("validation:home.edit.oneLineConcept") },
    { name: "proposedSolution", label: t("validation:home.edit.proposedSolution") },
  ];
  const summaryText = (summary: Values) =>
    fields.map((field) => `${field.label}: ${summary[field.name]}`).join("\n");

  const item = useSavedItem({
    itemKey: `idea:${idea.id}`,
    method: "PATCH",
    url: `/api/v1/ideas/${idea.id}`,
    lockVersion: idea.lockVersion,
    onSaved: () => {
      void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
      // The breadcrumb reads the name from the route's loader.
      void router.invalidate();
    },
    onSentElsewhere: () => {
      void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
    },
    onAdopt: (current) => {
      const theirs = currentValueSchema.safeParse(current.value);
      if (theirs.success) setValues(toValues(theirs.data));
      setErrors({});
      void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
    },
    onRestore: (patch) => {
      setValues((prev) => ({
        name: typeof patch.name === "string" ? patch.name : prev.name,
        oneLineConcept:
          typeof patch.oneLineConcept === "string" ? patch.oneLineConcept : prev.oneLineConcept,
        proposedSolution:
          typeof patch.proposedSolution === "string"
            ? patch.proposedSolution
            : "proposedSolution" in patch
              ? ""
              : prev.proposedSolution,
      }));
    },
  });

  const change = (field: Field, value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    const result = validate(createIdeaBodySchema, t)({ value: next });
    const message = result?.fields[field];
    setErrors((prev) => ({ ...prev, [field]: message }));
    // What waits from before this keystroke is the last value that passed; it goes out now so the
    // timer cannot send it after the field has become invalid.
    if (message) void item.flush();
    else item.save(bodyOf(field, value));
  };

  // The hook stops listening when the sheet unmounts, so a save still on its way would not refresh
  // the screens behind; they are refreshed once the queue has gone quiet.
  const close = () => {
    const queued = item.flush();
    onClose();
    void queued.then(async () => {
      await autosave.idle();
      void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
      void router.invalidate();
    });
  };

  const failure = item.failure;
  // A refusal for lost rights is not queued; the screens behind read the idea and the person again (SDD 8.2).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to a new failure only
  useEffect(() => {
    if (!failure || failure.willRetry) return;
    if (["ARCHIVED", "FORBIDDEN", "NO_ACCESS"].includes(failure.error.code)) {
      void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    }
  }, [failure]);

  const theirs = item.conflict ? currentValueSchema.safeParse(item.conflict.value) : null;

  return (
    <>
      <Dialog
        isOpen
        size="medium"
        title={t("validation:home.edit.title")}
        closeLabel={t("app:close")}
        isKeyboardDismissDisabled={item.conflict !== null}
        onOpenChange={(open) => !open && close()}
      >
        <Stack gap="space-200">
          {failure ? (
            <InlineAlert
              variant="negative"
              heading={failure.willRetry ? t("form:saveFailed") : errorText(t, failure.error)}
            >
              <Flex gap="space-100" align="center" wrap>
                <Button
                  variant="secondary"
                  size="S"
                  onPress={() =>
                    item.retry(
                      Object.assign(
                        {},
                        ...fields
                          .filter(({ name }) => !errors[name])
                          .map(({ name }) => bodyOf(name, values[name])),
                      ),
                    )
                  }
                >
                  {t("form:retry")}
                </Button>
              </Flex>
            </InlineAlert>
          ) : null}
          <Form
            aria-label={t("validation:home.edit.title")}
            onSubmit={(event) => event.preventDefault()}
          >
            <TextField
              label={t("validation:home.edit.name")}
              isRequired
              autoFocus
              value={values.name}
              errorMessage={errors.name}
              isInvalid={Boolean(errors.name)}
              onChange={(value) => change("name", value)}
              onBlur={() => void item.flush()}
            />
            <TextField
              label={t("validation:home.edit.oneLineConcept")}
              isRequired
              value={values.oneLineConcept}
              errorMessage={errors.oneLineConcept}
              isInvalid={Boolean(errors.oneLineConcept)}
              onChange={(value) => change("oneLineConcept", value)}
              onBlur={() => void item.flush()}
            />
            <TextArea
              label={t("validation:home.edit.proposedSolution")}
              value={values.proposedSolution}
              errorMessage={errors.proposedSolution}
              isInvalid={Boolean(errors.proposedSolution)}
              onChange={(value) => change("proposedSolution", value)}
              onBlur={() => void item.flush()}
            />
          </Form>
          <Text variant="caption" tone="secondary">
            {t("validation:home.edit.autosave")}
          </Text>
        </Stack>
      </Dialog>
      <ConflictDialog
        current={item.conflict}
        itemName={t("validation:home.edit.conflictItem")}
        theirText={theirs?.success ? summaryText(toValues(theirs.data)) : null}
        mineText={summaryText(values)}
        onLoadTheirs={item.loadTheirs}
        onKeepMine={item.keepMine}
      />
    </>
  );
}
