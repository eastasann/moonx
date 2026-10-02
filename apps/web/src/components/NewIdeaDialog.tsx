import { Button, Dialog, Form, InlineAlert, Stack, TextArea, TextField } from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { newIdeaSchema } from "../forms/schemas";
import { api, call } from "../lib/api";
import { errorText } from "../lib/error-text";
import { fieldProps, validate } from "../lib/form";
import { IDEAS_KEY } from "../lib/idea-actions";
import { canEditIdeas, useWorkspaceRole } from "../lib/ideas";
import { useGoTo } from "../lib/navigate";
import { useOverlay } from "../lib/overlay";

/**
 * M1: write down a new idea (design-spec 6.8) and open its validation home. It reads the
 * workspace from the URL, so screen 6 and the dashboard open it the same way (`?modal=new-idea`).
 */
export function NewIdeaDialog() {
  const { t } = useTranslation(["ideas", "app"]);
  const { workspaceId } = useParams({ strict: false }) as { workspaceId?: string };
  const canCreate = canEditIdeas(useWorkspaceRole(workspaceId ?? ""));
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const { closeModal } = useOverlay();
  const formId = useId();

  const create = useMutation({
    mutationFn: (body: { name: string; oneLineConcept: string; proposedSolution?: string }) =>
      call(
        api()
          .api.v1.workspaces({ workspaceId: workspaceId as string })
          .ideas.post(body),
      ),
    onSuccess: async (idea) => {
      await queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
      goTo(`/w/${workspaceId}/ideas/${idea.id}`);
    },
  });

  const form = useForm({
    defaultValues: { name: "", oneLineConcept: "", proposedSolution: "" },
    validators: { onSubmit: validate(newIdeaSchema, t) },
    onSubmit: ({ value }) => {
      const proposedSolution = value.proposedSolution.trim();
      return (
        create
          .mutateAsync({
            name: value.name.trim(),
            oneLineConcept: value.oneLineConcept.trim(),
            ...(proposedSolution ? { proposedSolution } : {}),
          })
          // The dialog shows the failure through `create.error` and keeps the input.
          .catch(() => {})
      );
    },
  });

  // A typed `?modal=new-idea` must not open a control for an action the person cannot do.
  if (!workspaceId || !canCreate) return null;

  return (
    <Dialog
      isOpen
      isDismissable
      isKeyboardDismissDisabled={create.isPending}
      size="medium"
      title={t("ideas:new.title")}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && closeModal()}
      actions={
        <form.Subscribe selector={(state) => state.values}>
          {(values) => (
            <>
              <Button variant="secondary" onPress={closeModal}>
                {t("app:cancel")}
              </Button>
              <Button
                type="submit"
                form={formId}
                variant="accent"
                isDisabled={!values.name.trim() || !values.oneLineConcept.trim()}
                isPending={create.isPending}
                pendingLabel={t("app:saving")}
              >
                {t("ideas:new.create")}
              </Button>
            </>
          )}
        </form.Subscribe>
      }
    >
      <Form
        aria-label={t("ideas:new.title")}
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Stack gap="space-200">
          {create.error ? (
            <InlineAlert variant="negative" heading={t("ideas:new.saveFailed")}>
              {errorText(t, create.error)}
            </InlineAlert>
          ) : null}
          <form.Field name="name">
            {(field) => (
              <TextField label={t("ideas:new.name")} isRequired autoFocus {...fieldProps(field)} />
            )}
          </form.Field>
          <form.Field name="oneLineConcept">
            {(field) => (
              <TextField
                label={t("ideas:new.concept")}
                description={t("ideas:new.conceptHelp")}
                isRequired
                {...fieldProps(field)}
              />
            )}
          </form.Field>
          <form.Field name="proposedSolution">
            {(field) => (
              <TextArea
                label={t("ideas:new.solution")}
                description={t("ideas:new.solutionHelp")}
                {...fieldProps(field)}
              />
            )}
          </form.Field>
        </Stack>
      </Form>
    </Dialog>
  );
}
