import { parseDate } from "@internationalized/date";
import { formatDate } from "@moonx/i18n";
import {
  type Classification,
  type CreateEvidenceBody,
  type ResearchLogInput,
  type SourceType,
  type SupportsCheck,
  sourceTypeSchema,
  supportsCheckSchema,
} from "@moonx/schemas";
import {
  AlertDialog,
  Button,
  Checkbox,
  CheckboxGroup,
  DatePicker,
  Dialog,
  Form,
  InlineAlert,
  Picker,
  PickerItem,
  SearchField,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tag,
  TagGroup,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { evidenceUrlSchema, newResearchLogSchema } from "../forms/evidence";
import { api, call } from "../lib/api";
import { isApiError } from "../lib/api-error";
import { errorText } from "../lib/error-text";
import { evidenceTagText } from "../lib/evidence-tag";
import { fieldProps, validate } from "../lib/form";
import { IDEAS_KEY } from "../lib/idea-actions";
import { researchLogKey, validationKey } from "../lib/validation-keys";

/** What kinds of item evidence can be attached to (V4). */
export type EvidenceTarget = CreateEvidenceBody["target"];

/** The classification and version after evidence was attached or removed (V4, V5). */
export interface EvidenceResult {
  classification: Classification;
  lockVersion: number;
}

export interface EvidenceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  validationId: string;
  target: EvidenceTarget;
  /** The item's name, such as "01 WHO — Who exactly is the customer?". */
  label: string;
  classification: Classification;
  /** The item's current `lockVersion`, read when a request is sent. */
  getLockVersion: () => number;
  /** Receives every result so the screen can refresh its copy and its version. */
  onChanged: (result: EvidenceResult) => void;
  /** Someone saved the item first: the screen reads it again (text and version) before anything else is sent. */
  onConflict: () => void;
  /**
   * Whether the item has a F/A/U (an answer, a number). A competitor or an assumption has none:
   * evidence is attached to it without making it Fact, which V4 would refuse (default true).
   */
  hasFau?: boolean;
}

/**
 * M2, the evidence sheet (design-spec 6.0.3). Attaching evidence to an item that is not Fact yet
 * makes it Fact in the same request, so closing the sheet without attaching changes nothing and
 * an answer is never Fact without evidence. Removing the last evidence of a Fact asks first.
 */
export function EvidenceSheet({
  isOpen,
  onClose,
  validationId,
  target,
  label,
  classification,
  getLockVersion,
  onChanged,
  onConflict,
  hasFau = true,
}: EvidenceSheetProps) {
  const { t } = useTranslation(["form", "app"]);
  const queryClient = useQueryClient();
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const attach = useMutation({
    mutationFn: (
      source: Pick<CreateEvidenceBody, "researchLogEntryId" | "newResearchLog" | "url" | "note">,
    ) =>
      call(
        api()
          .api.v1.validations({ validationId })
          .evidence.post({
            target,
            ...source,
            setFact: (hasFau && classification.fau !== "fact") || undefined,
            lockVersion: getLockVersion(),
          }),
      ),
    onSuccess: (result) => {
      setNotice(null);
      onChanged({ classification: result.classification, lockVersion: result.lockVersion });
      void queryClient.invalidateQueries({ queryKey: researchLogKey(validationId) });
      void queryClient.invalidateQueries({ queryKey: validationKey(validationId) });
      void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
    },
    onError: adoptConflict,
  });

  const remove = useMutation({
    mutationFn: (evidenceId: string) =>
      call(
        api()
          .api.v1.evidence({ evidenceId })
          .delete({}, { query: { lockVersion: getLockVersion() } }),
      ),
    onSuccess: (result) => {
      setNotice(null);
      onChanged({ classification: result.classification, lockVersion: result.lockVersion });
      void queryClient.invalidateQueries({ queryKey: validationKey(validationId) });
      void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
    },
    onError: adoptConflict,
  });

  /** Somebody saved the item first: the screen reloads it and the person looks again. */
  function adoptConflict(error: unknown) {
    if (!isApiError(error) || error.code !== "CONFLICT") return;
    onConflict();
    setNotice(t("form:evidence.changedMeanwhile"));
  }

  const failure = attach.error ?? remove.error;
  const isLastOfFact = (id: string) =>
    classification.fau === "fact" &&
    classification.evidence.length === 1 &&
    classification.evidence[0]?.id === id;
  const removeEvidence = (ids: string[]) => {
    const id = ids[0];
    if (!id) return;
    if (isLastOfFact(id)) setConfirmingRemoval(id);
    else remove.mutate(id);
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={t("form:evidence.title")}
        closeLabel={t("app:close")}
        size="medium"
        actions={<Button onPress={onClose}>{t("form:evidence.done")}</Button>}
      >
        <Stack gap="space-300">
          <Text variant="label">{t("form:evidence.target", { label })}</Text>
          {notice ? <InlineAlert variant="notice" heading={notice} /> : null}
          {failure && !(isApiError(failure) && failure.code === "CONFLICT") ? (
            <InlineAlert variant="negative" heading={errorText(t, failure)} />
          ) : null}
          {classification.evidence.length > 0 ? (
            <TagGroup
              label={t("form:evidence.attached")}
              onRemove={removeEvidence}
              removeLabel={t("form:evidence.remove")}
            >
              {classification.evidence.map((evidence) => (
                <Tag key={evidence.id} id={evidence.id}>
                  {evidenceTagText(evidence, t("form:evidence.deletedLog"))}
                </Tag>
              ))}
            </TagGroup>
          ) : (
            <Text tone="secondary">{t("form:evidence.none")}</Text>
          )}
          <Tabs>
            <TabList aria-label={t("form:evidence.ways")}>
              <Tab id="choose">{t("form:evidence.choose")}</Tab>
              <Tab id="record">{t("form:evidence.record")}</Tab>
              <Tab id="url">{t("form:evidence.url")}</Tab>
            </TabList>
            <TabPanel id="choose">
              <ChooseLog
                validationId={validationId}
                attachedIds={classification.evidence.flatMap((e) =>
                  e.researchLog ? [e.researchLog.id] : [],
                )}
                isPending={attach.isPending}
                onAttach={async (ids) => {
                  try {
                    for (const id of ids) await attach.mutateAsync({ researchLogEntryId: id });
                  } catch {
                    // Stops at the first failure; the sheet shows it through `attach.error`.
                  }
                }}
              />
            </TabPanel>
            <TabPanel id="record">
              <RecordLog
                isPending={attach.isPending}
                onSubmit={(input) => attach.mutateAsync({ newResearchLog: input })}
              />
            </TabPanel>
            <TabPanel id="url">
              <UrlEvidence
                isPending={attach.isPending}
                onSubmit={(url, note) => attach.mutateAsync({ url, note: note || undefined })}
              />
            </TabPanel>
          </Tabs>
        </Stack>
      </Dialog>
      <AlertDialog
        isOpen={confirmingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmingRemoval(null);
        }}
        variant="negative"
        title={t("form:evidence.removeLast.title")}
        primaryActionLabel={t("form:evidence.removeLast.confirm")}
        cancelLabel={t("app:cancel")}
        onPrimaryAction={() => {
          if (confirmingRemoval) remove.mutate(confirmingRemoval);
        }}
      >
        {t("form:evidence.removeLast.body")}
      </AlertDialog>
    </>
  );
}

function ChooseLog({
  validationId,
  attachedIds,
  isPending,
  onAttach,
}: {
  validationId: string;
  attachedIds: string[];
  isPending: boolean;
  onAttach: (ids: string[]) => Promise<void>;
}) {
  const { t } = useTranslation(["form", "app"]);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const q = search.trim();
  const logs = useQuery({
    queryKey: researchLogKey(validationId, { q, picker: true }),
    queryFn: () =>
      call(
        api()
          .api.v1.validations({ validationId })
          ["research-log"].get({ query: { limit: 50, ...(q ? { q } : {}) } }),
      ),
  });
  const candidates = (logs.data?.items ?? []).filter((entry) => !attachedIds.includes(entry.id));
  return (
    <Stack gap="space-200">
      <SearchField
        label={t("form:evidence.search")}
        clearLabel={t("form:evidence.clear")}
        value={search}
        onChange={setSearch}
      />
      {logs.isError ? <InlineAlert variant="negative" heading={errorText(t, logs.error)} /> : null}
      {logs.isSuccess && candidates.length === 0 ? (
        <Text tone="secondary">{t("form:evidence.noLogs")}</Text>
      ) : null}
      {candidates.length > 0 ? (
        <CheckboxGroup label={t("form:evidence.logs")} value={chosen} onChange={setChosen}>
          {candidates.map((entry) => (
            <Checkbox key={entry.id} value={entry.id}>
              {entry.observedOn ? `${formatDate(entry.observedOn)} ` : ""}
              {entry.topic}
            </Checkbox>
          ))}
        </CheckboxGroup>
      ) : null}
      <Button
        variant="secondary"
        isDisabled={chosen.length === 0}
        isPending={isPending}
        pendingLabel={t("app:saving")}
        onPress={() => void onAttach(chosen).then(() => setChosen([]))}
      >
        {t("form:evidence.attachSelected", { count: chosen.length })}
      </Button>
    </Stack>
  );
}

interface RecordValues {
  observedOn: string;
  topic: string;
  observation: string;
  sourceType: string;
  sourceUrl: string;
  supportsChecks: SupportsCheck[];
  supportsNote: string;
}

const EMPTY_RECORD: RecordValues = {
  observedOn: "",
  topic: "",
  observation: "",
  sourceType: "",
  sourceUrl: "",
  supportsChecks: [],
  supportsNote: "",
};

const blankToUndefined = (value: string) => (value.trim() === "" ? undefined : value);

function toResearchLogInput(values: RecordValues): ResearchLogInput {
  return {
    observedOn: blankToUndefined(values.observedOn),
    topic: values.topic,
    observation: blankToUndefined(values.observation),
    sourceType: (blankToUndefined(values.sourceType) as SourceType | undefined) ?? undefined,
    sourceUrl: blankToUndefined(values.sourceUrl),
    supportsChecks: values.supportsChecks,
    supportsNote: blankToUndefined(values.supportsNote),
  };
}

function RecordLog({
  isPending,
  onSubmit,
}: {
  isPending: boolean;
  onSubmit: (input: ResearchLogInput) => Promise<unknown>;
}) {
  const { t } = useTranslation(["form", "app", "validation"]);
  const form = useForm({
    defaultValues: EMPTY_RECORD,
    validators: {
      onSubmit: ({ value }) =>
        validate(newResearchLogSchema, t)({ value: toResearchLogInput(value) }),
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSubmit(toResearchLogInput(value));
        formApi.reset();
      } catch {
        // The sheet shows the failure above the tabs and the input stays in the form.
      }
    },
  });
  return (
    <Form
      aria-label={t("form:evidence.record")}
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="observedOn">
        {(field) => (
          <DatePicker
            label={t("form:evidence.log.date")}
            openLabel={t("form:evidence.log.openCalendar")}
            previousMonthLabel={t("form:evidence.log.previousMonth")}
            nextMonthLabel={t("form:evidence.log.nextMonth")}
            value={field.state.value ? parseDate(field.state.value) : null}
            onChange={(value) => field.handleChange(value ? value.toString() : "")}
          />
        )}
      </form.Field>
      <form.Field name="topic">
        {(field) => (
          <TextField label={t("form:evidence.log.topic")} isRequired {...fieldProps(field)} />
        )}
      </form.Field>
      <form.Field name="observation">
        {(field) => <TextArea label={t("form:evidence.log.observation")} {...fieldProps(field)} />}
      </form.Field>
      <form.Field name="sourceType">
        {(field) => (
          <Picker
            label={t("form:evidence.log.sourceType")}
            value={field.state.value || null}
            onChange={(value) => field.handleChange(value ?? "")}
          >
            {sourceTypeSchema.options.map((type) => (
              <PickerItem key={type} id={type}>
                {t(`form:evidence.sourceTypes.${type}`)}
              </PickerItem>
            ))}
          </Picker>
        )}
      </form.Field>
      <form.Field name="sourceUrl">
        {(field) => (
          <TextField
            label={t("form:evidence.log.sourceUrl")}
            inputMode="url"
            {...fieldProps(field)}
          />
        )}
      </form.Field>
      <form.Field name="supportsChecks">
        {(field) => (
          <CheckboxGroup
            label={t("form:evidence.log.supports")}
            value={field.state.value}
            onChange={(value) => field.handleChange(value as SupportsCheck[])}
          >
            {supportsCheckSchema.options.map((check) => (
              <Checkbox key={check} value={check}>
                {t(`validation:checks.${check}.label`)}
              </Checkbox>
            ))}
          </CheckboxGroup>
        )}
      </form.Field>
      <form.Field name="supportsNote">
        {(field) => <TextArea label={t("form:evidence.log.supportsNote")} {...fieldProps(field)} />}
      </form.Field>
      <Button type="submit" isPending={isPending} pendingLabel={t("app:saving")}>
        {t("form:evidence.log.submit")}
      </Button>
    </Form>
  );
}

function UrlEvidence({
  isPending,
  onSubmit,
}: {
  isPending: boolean;
  onSubmit: (url: string, note: string) => Promise<unknown>;
}) {
  const { t } = useTranslation(["form", "app"]);
  const form = useForm({
    defaultValues: { url: "", note: "" },
    validators: { onSubmit: validate(evidenceUrlSchema, t) },
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSubmit(value.url.trim(), value.note.trim());
        formApi.reset();
      } catch {
        // The sheet shows the failure above the tabs and the input stays in the form.
      }
    },
  });
  return (
    <Form
      aria-label={t("form:evidence.url")}
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="url">
        {(field) => (
          <TextField
            label={t("form:evidence.urlField")}
            isRequired
            inputMode="url"
            {...fieldProps(field)}
          />
        )}
      </form.Field>
      <form.Field name="note">
        {(field) => <TextArea label={t("form:evidence.urlNote")} {...fieldProps(field)} />}
      </form.Field>
      <Button type="submit" isPending={isPending} pendingLabel={t("app:saving")}>
        {t("form:evidence.urlSubmit")}
      </Button>
    </Form>
  );
}
