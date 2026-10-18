import {
  type IdeaCreate,
  ideaNameSchema,
  longTextSchema,
  oneLineConceptSchema,
  plainText,
  TEXT_LIMITS,
  type ValidationHome,
} from "@moonx/schemas";
import {
  AlertDialog,
  Button,
  ButtonGroup,
  Dialog,
  Flex,
  Form,
  InlineAlert,
  Stack,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import type { SaveTarget } from "../lib/autosave";
import { useAutosave, useSaveItem } from "../lib/autosave-react";
import { useAppForm, useOneAtATime, useRejectedFields } from "../lib/form";
import { inputIssueMessage } from "../lib/input-issues";
import { ideaHref } from "../lib/links";
import { useIsOnline } from "../lib/online";
import { ideaKey, validationHomeQuery, workspaceKey } from "../lib/queries";
import { isTransient } from "../lib/query";
import { SaveFailureNote } from "./SaveFeedback";
import { failureCode, rateLimitWords } from "./SendFailure";
import { reportOnce } from "./states";
import { useWorkspace } from "./workspace";

/** The proposed solution as its field holds it: text, blank for none (6.0.8 長文). */
const solutionInputSchema = plainText(TEXT_LIMITS.long);

/**
 * M1 New idea (design-spec 3.8・6.8): name and one-line concept, which are required, and
 * the proposed solution (6.0.8). Creating it makes its validation on the latest template
 * and opens its 13 in place of the dialog's history entry. Medium; a tray on a phone. A
 * failure keeps what was typed (6.0.6 モーダルの共通の決まり): no published template says
 * so where Create is; the network or an API that is down offers Retry in place; anything
 * else is unexpected, in the small dialog with its Ref, whose Close closes M1.
 */
export function NewIdeaDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["ideas", "app", "errors"]);
  const { workspace } = useWorkspace();
  const isOnline = useIsOnline();
  const formId = useId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: (values: IdeaCreate) =>
      unwrap(
        api()
          .api.v1.workspaces({ workspaceId: workspace.id })
          .ideas.post(values),
      ),
    onSuccess: async (idea) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceKey(workspace.id),
      });
      // In place of M1's entry: Back from 13 leads to the screen under it, not to M1.
      await navigate({ href: ideaHref(workspace.id, idea.id), replace: true });
    },
  });
  // A second I1 POST would make a second idea: a second submit waits for the first.
  const oneAtATime = useOneAtATime();
  const rejections = useRejectedFields([
    "name",
    "oneLineConcept",
    "proposedSolution",
  ] as const);
  const form = useAppForm({
    defaultValues: { name: "", oneLineConcept: "", proposedSolution: "" },
    listeners: {
      onChange: ({ fieldApi }) => rejections.clear(fieldApi.name),
    },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        rejections.clear();
        await create.mutateAsync(value).catch((error: unknown) => {
          // Shown from the mutation's state below, or under the field the API refused.
          if (rejections.reject(error)) create.reset();
        });
      }),
  });
  const failure = create.error;
  const code = failureCode(failure);
  const rateLimited = rateLimitWords(failure);
  const inPlace =
    failure === null
      ? null
      : code === "TEMPLATE_NOT_PUBLISHED"
        ? t("errors:TEMPLATE_NOT_PUBLISHED")
        : rateLimited;
  const isUnexpected =
    failure !== null &&
    inPlace === null &&
    !(
      failure instanceof ApiError &&
      (isTransient(failure) || failure.status === 401)
    );
  // The API's request id, or the Sentry event of the Web's own failure (SDD 8.2).
  const reference = useMemo(
    () =>
      !isUnexpected
        ? null
        : failure instanceof ApiError
          ? failure.requestId
          : reportOnce(failure),
    [isUnexpected, failure],
  );
  const canRetry = isOnline && !create.isPending;
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      size="M"
      density="spacious"
      title={t("ideas:form.newTitle")}
      buttons={
        <form.AppForm>
          <ButtonGroup align="end">
            <Button variant="secondary" onPress={onClose}>
              {t("ideas:form.cancel")}
            </Button>
            <form.SubmitButton form={formId} isDisabled={!isOnline}>
              {t("ideas:form.create")}
            </form.SubmitButton>
          </ButtonGroup>
        </form.AppForm>
      }
    >
      <form.AppForm>
        <Form
          id={formId}
          onSubmit={() => {
            void form.handleSubmit();
          }}
        >
          <form.AppField
            name="name"
            validators={{ onMount: ideaNameSchema, onChange: ideaNameSchema }}
          >
            {(field) => (
              <field.TextField
                rejection={rejections.rejectionOf("name")}
                label={t("ideas:form.name")}
                width="full"
                isRequired
                isReadOnly={!isOnline}
                autoFocus
              />
            )}
          </form.AppField>
          <form.AppField
            name="oneLineConcept"
            validators={{
              onMount: oneLineConceptSchema,
              onChange: oneLineConceptSchema,
            }}
          >
            {(field) => (
              <field.TextField
                rejection={rejections.rejectionOf("oneLineConcept")}
                label={t("ideas:form.concept")}
                width="full"
                isRequired
                isReadOnly={!isOnline}
              />
            )}
          </form.AppField>
          <form.AppField
            name="proposedSolution"
            validators={{ onChange: solutionInputSchema }}
          >
            {(field) => (
              <field.TextArea
                label={t("ideas:form.solution")}
                width="full"
                isReadOnly={!isOnline}
              />
            )}
          </form.AppField>
          {inPlace !== null && (
            <InlineAlert variant="negative">{inPlace}</InlineAlert>
          )}
          {failure !== null && inPlace === null && !isUnexpected && (
            <InlineAlert variant="negative">
              <Flex gap="space-200" wrap alignItems="center">
                <Text>{t("app:state.couldNotSave")}</Text>
                <Button
                  variant="secondary"
                  size="S"
                  type="submit"
                  form={formId}
                  isDisabled={!canRetry}
                >
                  {t("app:state.retry")}
                </Button>
              </Flex>
            </InlineAlert>
          )}
        </Form>
        {isUnexpected && (
          <AlertDialog
            isOpen
            variant="error"
            size="S"
            title={t("app:state.unexpected")}
            primaryActionLabel={t("app:state.retry")}
            cancelLabel={t("app:state.close")}
            onPrimaryAction={() => void form.handleSubmit()}
            isPrimaryActionDisabled={!canRetry}
            onCancel={onClose}
          >
            {reference === null
              ? ""
              : t("app:state.ref", { ref: reference.slice(0, 8) })}
          </AlertDialog>
        )}
      </form.AppForm>
    </Dialog>
  );
}

/** What a conflict on an idea's summary holds (SDD 5.2 ConflictCurrent, db history-values). */
const summaryValueSchema = z.object({
  name: z.string(),
  oneLineConcept: z.string(),
  proposedSolution: z.string().nullable(),
});

type SummaryField = "name" | "oneLineConcept" | "proposedSolution";

/** The save of an idea's summary (I2 PATCH, design-spec 6.0.2's item "アイデアの概要"). */
function summaryTarget(
  queryClient: QueryClient,
  workspaceId: string,
  ideaId: string,
  noun: string,
): SaveTarget {
  const homeKey = validationHomeQuery(ideaId).queryKey;
  const put = (
    patch: Partial<ValidationHome["idea"]> &
      Pick<ValidationHome["idea"], "proposedSolution">,
  ) =>
    queryClient.setQueryData(homeKey, (home) =>
      home === undefined
        ? undefined
        : {
            ...home,
            idea: { ...home.idea, ...patch },
            summary: { ...home.summary, solution: patch.proposedSolution },
          },
    );
  return {
    key: `idea:${ideaId}`,
    noun,
    send: async (fields, lockVersion, force) => {
      const idea = await unwrap(
        api()
          .api.v1.ideas({ ideaId: inPath(ideaId) })
          .patch({ ...fields, lockVersion, ...(force ? { force } : {}) }),
      );
      put(idea);
      // 6 and 5 list the name and the concept.
      void queryClient.invalidateQueries({
        queryKey: workspaceKey(workspaceId),
      });
      return idea.lockVersion;
    },
    loadTheirs: (current) => {
      const value = summaryValueSchema.safeParse(current.value);
      if (value.success) {
        put({
          ...value.data,
          lockVersion: current.lockVersion,
          updatedAt: current.updatedAt,
          updatedBy: current.updatedBy,
        });
      } else {
        // Not the summary's shape: the screen reads it again instead.
        void queryClient.invalidateQueries({ queryKey: ideaKey(ideaId) });
      }
      void queryClient.invalidateQueries({
        queryKey: workspaceKey(workspaceId),
      });
    },
  };
}

const fieldSchemas = {
  name: ideaNameSchema,
  oneLineConcept: oneLineConceptSchema,
  proposedSolution: longTextSchema,
} as const satisfies Record<SummaryField, z.ZodType>;

/**
 * Edit summary (design-spec 6.1): the idea's name, one-line concept and proposed solution
 * in a sheet, saved as they are typed (6.0.2), without a save button. A field that breaks
 * its rules (6.0.8: the name and the concept cannot be empty) is not sent and says why
 * under it. The fields are read only offline. Closing it sends what waits.
 */
export function EditSummaryDialog({
  home,
  onClose,
}: {
  home: ValidationHome;
  onClose: () => void;
}) {
  const { t } = useTranslation(["ideas", "validation", "errors"]);
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const isOnline = useIsOnline();
  const { idea } = home;
  const target = useMemo(
    () =>
      summaryTarget(
        queryClient,
        workspace.id,
        idea.id,
        t("validation:home.summaryNoun"),
      ),
    [queryClient, workspace.id, idea.id, t],
  );
  const saving = useSaveItem(target.key);
  // What was typed that breaks its rules: shown, never sent.
  const [invalid, setInvalid] = useState<Partial<Record<SummaryField, string>>>(
    {},
  );
  // Leaving the sheet any way sends what waits (design-spec 6.0.2「画面を離れるとき」).
  useEffect(() => () => autosave.flush(target.key), [autosave, target.key]);

  const shown = (field: SummaryField): string => {
    const typed = invalid[field];
    if (typed !== undefined) return typed;
    if (saving !== undefined && Object.hasOwn(saving.unsaved, field)) {
      return String(saving.unsaved[field] ?? "");
    }
    return idea[field] ?? "";
  };
  const errorOf = (field: SummaryField): string | undefined => {
    const typed = invalid[field];
    if (typed !== undefined) {
      const [issue] = fieldSchemas[field].safeParse(typed).error?.issues ?? [];
      return issue === undefined ? undefined : inputIssueMessage(issue);
    }
    // The API's last guard (SDD 8.2): a 422 naming the field puts its reason under it,
    // in the words of a format its details cannot word more closely (as M1's).
    const failure = saving?.status === "rejected" ? saving.failure : null;
    const details = failure?.detail.details;
    return failure?.code === "VALIDATION_FAILED" &&
      Array.isArray(details) &&
      details.some((detail) => (detail as { path?: unknown }).path === field)
      ? t("errors:input.format")
      : undefined;
  };
  const change = (field: SummaryField, value: string) => {
    if (fieldSchemas[field].safeParse(value).success) {
      setInvalid(({ [field]: _, ...rest }) => rest);
      autosave.change(target, idea.lockVersion, { [field]: value });
    } else {
      setInvalid((fields) => ({ ...fields, [field]: value }));
      autosave.discard(target.key, [field]);
    }
  };
  const fieldProps = (field: SummaryField) => {
    const error = errorOf(field);
    return {
      value: shown(field),
      onChange: (value: string) => change(field, value),
      onBlur: () => autosave.flush(target.key),
      isReadOnly: !isOnline,
      isInvalid: error !== undefined,
      errorMessage: error,
    };
  };
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable
      size="M"
      density="spacious"
      title={t("ideas:form.editTitle")}
    >
      <Stack gap="space-300">
        <TextField
          {...fieldProps("name")}
          label={t("ideas:form.name")}
          width="full"
          isRequired
          autoFocus
        />
        <TextField
          {...fieldProps("oneLineConcept")}
          label={t("ideas:form.concept")}
          width="full"
          isRequired
        />
        <TextArea
          {...fieldProps("proposedSolution")}
          label={t("ideas:form.solution")}
          width="full"
        />
        <SaveFailureNote itemKey={target.key} />
      </Stack>
    </Dialog>
  );
}
