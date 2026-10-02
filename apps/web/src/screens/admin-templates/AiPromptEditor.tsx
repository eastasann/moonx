import { AI_PROMPT_MAX } from "@moonx/schemas";
import { Heading, Stack, Text, TextArea } from "@moonx/ui-web";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedPatch, useTemplateWrites } from "../../lib/admin-templates";

/**
 * The prompt the export for AI puts under `# Prompt` (design-spec 6.17 27). An empty prompt leaves
 * the section out of the export.
 */
export function AiPromptEditor({
  versionId,
  aiPrompt,
  readOnly,
}: {
  versionId: string;
  aiPrompt: string;
  readOnly: boolean;
}) {
  const { t } = useTranslation("admin");
  const { aiPrompt: write } = useTemplateWrites(versionId);
  const [text, setText] = useState(aiPrompt);
  const { schedule, flush } = useDebouncedPatch(({ aiPrompt: next }: { aiPrompt: string }) =>
    write.mutateAsync(next),
  );
  return (
    <Stack gap="space-300">
      <Heading level={2}>{t("edit.prompt.heading")}</Heading>
      <Text tone="secondary">{t("edit.prompt.help")}</Text>
      <TextArea
        label={t("edit.prompt.label")}
        value={text}
        maxLength={AI_PROMPT_MAX}
        isReadOnly={readOnly}
        onChange={(value) => {
          setText(value);
          schedule({ aiPrompt: value });
        }}
        onBlur={flush}
      />
    </Stack>
  );
}
