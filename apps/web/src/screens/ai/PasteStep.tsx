import { Button, FileTrigger, Flex, InlineAlert, Stack, Text, TextArea, Well } from "@moonx/ui-web";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** The upload limit of design-spec 6.7, in bytes. */
export const MAX_FILE_BYTES = 1_000_000;

export interface PasteStepProps {
  text: string;
  onText: (text: string) => void;
  /** The text is over the limit (characters, or bytes for a file). */
  isTooLong: boolean;
  /** The chosen file is over the limit; nothing is read from it. */
  onFileTooLong: () => void;
  /** Nothing readable was found in the last paste; offers the format and the one-block fallback. */
  noIds: { exampleId: string } | null;
  onContinueWhole: () => void;
}

/** The Paste step (design-spec 6.7 ①): the reply in a text field, or a `.md` / `.json` file. */
export function PasteStep({
  text,
  onText,
  isTooLong,
  onFileTooLong,
  noIds,
  onContinueWhole,
}: PasteStepProps) {
  const { t } = useTranslation("ai");
  const [fileFailed, setFileFailed] = useState(false);

  const read = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setFileFailed(false);
    if (file.size > MAX_FILE_BYTES) {
      onFileTooLong();
      return;
    }
    try {
      onText(await file.text());
    } catch {
      setFileFailed(true);
    }
  };

  return (
    <Stack gap="space-200">
      <TextArea
        label={t("import.paste.label")}
        placeholder={t("import.paste.placeholder")}
        value={text}
        isInvalid={isTooLong}
        errorMessage={t("import.paste.tooLong")}
        onChange={onText}
      />
      <Flex gap="space-200" align="center" wrap>
        <FileTrigger
          acceptedFileTypes={[".md", ".json", "text/markdown", "application/json"]}
          onSelect={(files) => void read(files)}
        >
          <Button variant="secondary">{t("import.paste.upload")}</Button>
        </FileTrigger>
        {fileFailed ? (
          <Text tone="negative" as="span">
            {t("import.paste.unreadableFile")}
          </Text>
        ) : null}
      </Flex>
      {noIds ? (
        <InlineAlert variant="notice" heading={t("import.paste.noIds")}>
          <Stack gap="space-200">
            <Text>{t("import.paste.noIdsBody")}</Text>
            <Well preformatted aria-label={t("import.paste.exampleLabel")}>
              {t("import.paste.example", { id: noIds.exampleId })}
            </Well>
            <Flex justify="start">
              <Button variant="secondary" onPress={onContinueWhole}>
                {t("import.paste.continueWhole")}
              </Button>
            </Flex>
          </Stack>
        </InlineAlert>
      ) : null}
    </Stack>
  );
}
