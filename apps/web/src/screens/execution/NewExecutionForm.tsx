import type { ExecutionType, LaunchTiming } from "@moonx/schemas";
import {
  Button,
  Flex,
  Form,
  InlineAlert,
  Picker,
  PickerItem,
  Stack,
  TextField,
} from "@moonx/ui-web";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../../lib/error-text";
import { createExecutionItem, EXECUTION_KEYS, LAUNCH_TIMINGS } from "../../lib/execution";
import type { ExecutionItem } from "../../lib/plans";

const MAX_TITLE = 200;

const TITLE_LABEL = {
  milestone: "execution:fields.milestone",
  launch: "execution:fields.timing",
  kpi: "execution:fields.kpi",
  open_question: "execution:fields.openQuestion",
  next_action: "execution:fields.action",
} as const satisfies Record<ExecutionType, string>;

export interface NewExecutionFormProps {
  planId: string;
  type: ExecutionType;
  onCreated: (item: ExecutionItem) => void;
  onCancel: () => void;
}

/**
 * The form of an item that does not exist yet. An item is created once its name is filled, so a
 * list never holds an unnamed row; every other column is edited afterwards with autosave. A
 * Launch row picks its bucket here (default Other) and a KPI its Area, since both decide where
 * the row appears.
 */
export function NewExecutionForm({ planId, type, onCreated, onCancel }: NewExecutionFormProps) {
  const { t } = useTranslation(["execution", "app"]);
  const [title, setTitle] = useState("");
  const [timing, setTiming] = useState<LaunchTiming>("other");
  const [area, setArea] = useState("");
  const submit = useMutation({
    mutationFn: () =>
      createExecutionItem(planId, {
        type,
        title: title.trim(),
        ...(type === "launch" ? { launchTiming: timing } : {}),
        ...(type === "kpi" && area.trim() !== "" ? { kpiArea: area.trim() } : {}),
      }),
    onSuccess: onCreated,
  });
  const isComplete = title.trim() !== "";
  return (
    <Form
      aria-label={t("execution:new.form", { type: t(EXECUTION_KEYS.type[type]) })}
      onSubmit={(event) => {
        event.preventDefault();
        if (isComplete) submit.mutate();
      }}
    >
      <Stack gap="space-300">
        {submit.error ? (
          <InlineAlert variant="negative" heading={errorText(t, submit.error)} />
        ) : null}
        {type === "kpi" ? (
          <TextField
            label={t("execution:fields.area")}
            value={area}
            maxLength={MAX_TITLE}
            onChange={setArea}
          />
        ) : null}
        <TextField
          label={t(TITLE_LABEL[type])}
          isRequired
          autoFocus
          value={title}
          maxLength={MAX_TITLE}
          onChange={setTitle}
        />
        {type === "launch" ? (
          <Picker
            label={t("execution:fields.bucket")}
            value={timing}
            onChange={(next) => next && setTiming(next as LaunchTiming)}
          >
            {LAUNCH_TIMINGS.map((id) => (
              <PickerItem key={id} id={id}>
                {t(EXECUTION_KEYS.timing[id])}
              </PickerItem>
            ))}
          </Picker>
        ) : null}
        <Flex gap="space-100" wrap>
          <Button
            type="submit"
            isDisabled={!isComplete}
            isPending={submit.isPending}
            pendingLabel={t("app:saving")}
          >
            {t("execution:new.submit")}
          </Button>
          <Button variant="secondary" isDisabled={submit.isPending} onPress={onCancel}>
            {t("app:cancel")}
          </Button>
        </Flex>
      </Stack>
    </Form>
  );
}
