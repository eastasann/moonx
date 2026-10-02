import { Heading, Picker, PickerItem, Stack, TextArea, TextField } from "@moonx/ui-web";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type SectionPatch,
  type TemplateSectionNode,
  trackDraftSave,
  useDebouncedPatch,
  useTemplateWrites,
} from "../../lib/admin-templates";
import { SECTION_KEY_PATTERN } from "../../lib/template-edit";

/** The right pane for a section (design-spec 6.17 27): key, title, guidance, and the plan's Part. */
export function SectionEditor({
  versionId,
  section,
  isPlan,
  readOnly,
}: {
  versionId: string;
  section: TemplateSectionNode;
  isPlan: boolean;
  readOnly: boolean;
}) {
  const { t } = useTranslation("admin");
  const { patchSection } = useTemplateWrites(versionId);
  const [values, setValues] = useState({
    key: section.key,
    title: section.title,
    guidance: section.guidance ?? "",
  });
  const { schedule, flush } = useDebouncedPatch((patch: SectionPatch) =>
    patchSection.mutateAsync({ id: section.id, patch }),
  );
  const keyInvalid = !SECTION_KEY_PATTERN.test(values.key);
  const titleInvalid = values.title.trim() === "";

  const change = (field: "key" | "title" | "guidance", value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (field === "key" && !SECTION_KEY_PATTERN.test(value)) return;
    if (field === "title" && value.trim() === "") return;
    schedule({
      [field]: field === "guidance" ? (value.trim() === "" ? null : value) : value.trim(),
    });
  };

  return (
    <Stack gap="space-300">
      <Heading level={2}>{t("edit.section.heading", { key: section.key })}</Heading>
      <TextField
        label={t("edit.section.key")}
        description={t("edit.section.keyHelp")}
        value={values.key}
        isReadOnly={readOnly}
        isInvalid={keyInvalid}
        errorMessage={keyInvalid ? t("edit.section.keyInvalid") : undefined}
        onChange={(value) => change("key", value)}
        onBlur={flush}
      />
      <TextField
        label={t("edit.section.title")}
        value={values.title}
        isRequired
        isReadOnly={readOnly}
        isInvalid={titleInvalid}
        errorMessage={titleInvalid ? t("edit.required") : undefined}
        onChange={(value) => change("title", value)}
        onBlur={flush}
      />
      <TextArea
        label={isPlan ? t("edit.section.summary") : t("edit.section.guidance")}
        value={values.guidance}
        isReadOnly={readOnly}
        onChange={(value) => change("guidance", value)}
        onBlur={flush}
      />
      {isPlan ? (
        <Picker
          label={t("edit.section.part")}
          value={section.part}
          isDisabled={readOnly}
          onChange={(part) => {
            if (part === "a" || part === "b") {
              void trackDraftSave(() =>
                patchSection.mutateAsync({ id: section.id, patch: { part } }),
              );
            }
          }}
        >
          <PickerItem id="a">{t("edit.section.partA")}</PickerItem>
          <PickerItem id="b">{t("edit.section.partB")}</PickerItem>
        </Picker>
      ) : null}
    </Stack>
  );
}
