import { Picker, PickerItem, Stack, Text, TextField } from "@moonx/ui-web";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type Assignable,
  type AssigneeChoice,
  assigneeBody,
  assigneeChoiceOf,
  assigneeText,
  userName,
} from "../../lib/execution";
import type { ExecutionItem } from "../../lib/plans";

const NONE = "__none";
const OTHER = "__name";
const MAX_NAME = 200;

export interface AssigneeFieldProps {
  assignee: ExecutionItem["assignee"];
  /** The Owners and Members of the workspace, who can be chosen. */
  members: readonly Assignable[];
  isReadOnly: boolean;
  /** Saves the one kind of assignee; `delay` is 0 for a pick and the autosave delay for typing. */
  onSave: (body: ReturnType<typeof assigneeBody>, options: { delay?: number }) => void;
  onBlur: () => void;
}

/**
 * The Assignee of an item (design-spec 6.13): an Owner or Member of the workspace, or a name
 * written by hand. Only a chosen member gets the deadline notifications, which the note under the
 * control says. Whatever is chosen, the other kind is sent as null so the two never coexist.
 */
export function AssigneeField({
  assignee,
  members,
  isReadOnly,
  onSave,
  onBlur,
}: AssigneeFieldProps) {
  const { t } = useTranslation("execution");
  const stored = assigneeChoiceOf(assignee);
  // Choosing "Someone else" has nothing to save until a name is typed, so the mode is local.
  const [mode, setMode] = useState<AssigneeChoice["kind"]>(stored.kind);
  const [name, setName] = useState(stored.kind === "name" ? stored.name : "");
  const [userId, setUserId] = useState(stored.kind === "member" ? stored.userId : null);

  if (isReadOnly) {
    return (
      <Stack gap="space-50">
        <Text variant="caption" tone="secondary">
          {t("execution:fields.assignee")}
        </Text>
        <Text variant="body-long" tone={assignee ? undefined : "secondary"}>
          {assigneeText(t, assignee) ?? t("execution:unassigned")}
        </Text>
      </Stack>
    );
  }

  const known = members.some((member) => member.id === userId);
  const value = mode === "member" ? (userId ?? NONE) : mode === "name" ? OTHER : NONE;

  return (
    <Stack gap="space-100">
      <Picker
        label={t("execution:fields.assignee")}
        value={value}
        onChange={(next) => {
          if (next === null || next === NONE) {
            setMode("none");
            onSave(assigneeBody({ kind: "none" }), { delay: 0 });
          } else if (next === OTHER) {
            setMode("name");
            if (name.trim() !== "") onSave(assigneeBody({ kind: "name", name }), { delay: 0 });
          } else {
            setMode("member");
            setUserId(next);
            onSave(assigneeBody({ kind: "member", userId: next }), { delay: 0 });
          }
        }}
      >
        <PickerItem id={NONE}>{t("execution:unassigned")}</PickerItem>
        {members.map((member) => (
          <PickerItem key={member.id} id={member.id}>
            {member.name}
          </PickerItem>
        ))}
        {assignee && "user" in assignee && assignee.user.id === userId && !known ? (
          <PickerItem id={assignee.user.id}>{userName(t, assignee.user)}</PickerItem>
        ) : null}
        <PickerItem id={OTHER}>{t("execution:someoneElse")}</PickerItem>
      </Picker>
      {mode === "name" ? (
        <TextField
          label={t("execution:fields.assigneeName")}
          value={name}
          maxLength={MAX_NAME}
          onChange={(next) => {
            setName(next);
            onSave(assigneeBody({ kind: "name", name: next }), {});
          }}
          onBlur={onBlur}
        />
      ) : null}
      <Text variant="caption" tone="secondary">
        {t("execution:assigneeNote")}
      </Text>
    </Stack>
  );
}
