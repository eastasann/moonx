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
  Button,
  ButtonGroup,
  Dialog,
  Form,
  InlineAlert,
  Stack,
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
import { api, inPath, unwrap } from "../lib/api";
import type { SaveTarget } from "../lib/autosave";
import { useAutosave, useSaveItem } from "../lib/autosave-react";
import { useAppForm, useOneAtATime, useRejectedFields } from "../lib/form";
import { inputIssueMessage } from "../lib/input-issues";
import { ideaHref } from "../lib/links";
import { useIsMounted } from "../lib/mounted";
import { useIsOnline } from "../lib/online";
import { ideaKey, validationHomeQuery, workspaceKey } from "../lib/queries";
import { useSendThrough } from "../lib/send";
import { useFailureOnceClosed } from "./ideaActions";
import { ModalSendFailure } from "./ModalFailure";
import { SaveFailureNote } from "./SaveFeedback";
import { failureCode } from "./SendFailure";
import { useWorkspace } from "./workspace";

/** The proposed solution as its field holds it: text, blank for none (6.0.8 長文). */
const solutionInputSchema = plainText(TEXT_LIMITS.long);

/**
 * M1 New idea (design-spec 3.8・6.8): name and one-line concept, which are required, and
 * the proposed solution (6.0.8). Creating it makes its validation on the latest template
 * and opens its 13 in place of the dialog's history entry. Medium; a tray on a phone. A
 * failure keeps what was typed (6.0.6 モーダルの共通の決まり): no published template says
 * so where Create is; the rest as every modal's send (ModalSendFailure), whose small
 * dialog's Close closes M1. Closed while Create is on its way, the idea is still made
 * and listed, but 13 does not open (6.0.6「送っている間に閉じた送信の失敗」).
 */
export function NewIdeaDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["ideas", "app", "errors"]);
  const { workspace } = useWorkspace();
  const isOnline = useIsOnline();
  const formId = useId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOpen = useIsMounted();
  const post = (values: IdeaCreate) =>
    unwrap(
      api().api.v1.workspaces({ workspaceId: workspace.id }).ideas.post(values),
    );
  const listChanged = () =>
    queryClient.invalidateQueries({ queryKey: workspaceKey(workspace.id) });
  // Cancel, Escape and Back close M1 while Create is on its way: its failure then says so
  // in a toast, whose Retry makes the idea from the same input and lists it. No published
  // template says so alone, as sending again meets the same refusal.
  const sendThrough = useSendThrough();
  const failedOnceClosed = useFailureOnceClosed(
    (values: IdeaCreate) => sendThrough(() => post(values)).then(listChanged),
    (error) =>
      failureCode(error) === "TEMPLATE_NOT_PUBLISHED"
        ? t("errors:TEMPLATE_NOT_PUBLISHED")
        : null,
  );
  const create = useMutation({
    mutationFn: post,
    onSuccess: async (idea) => {
      await listChanged();
      // Closed meanwhile: the user stays where closing took them, and the entry they are
      // on now is not replaced.
      if (!isOpen.current) return;
      // In place of M1's entry: Back from 13 leads to the screen under it, not to M1.
      await navigate({ href: ideaHref(workspace.id, idea.id), replace: true });
    },
    onError: (error, values) => failedOnceClosed(error, values),
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
      onChange: ({ fieldApi }) => {
        // A field the API refused, changed: the API is asked again, so the send's
        // failure goes with the reason under it.
        if (rejections.rejectionOf(fieldApi.name) !== undefined) create.reset();
        rejections.clear(fieldApi.name);
      },
    },
    onSubmit: ({ value }) =>
      oneAtATime(async () => {
        rejections.clear();
        await create.mutateAsync(value).catch((error: unknown) => {
          // Shown from the mutation's state below; a field the API refused says so under
          // it too (6.0.2).
          rejections.reject(error);
        });
      }),
  });
  const failure = create.error;
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
          {failure !== null &&
            (failureCode(failure) === "TEMPLATE_NOT_PUBLISHED" ? (
              <InlineAlert variant="negative">
                {t("errors:TEMPLATE_NOT_PUBLISHED")}
              </InlineAlert>
            ) : (
              <ModalSendFailure
                error={failure}
                onRetry={() => void form.handleSubmit()}
                isRetryDisabled={!canRetry}
                onClose={onClose}
              />
            ))}
        </Form>
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
