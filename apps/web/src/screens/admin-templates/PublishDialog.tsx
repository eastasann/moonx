import type { TemplateValidation } from "@moonx/schemas";
import { Button, Dialog, InlineAlert, RowList, RowListItem, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { errorText } from "../../lib/error-text";

/**
 * "Publish as v{n}" (design-spec 6.17 27). The checks run first: an error blocks the publish and
 * names where to fix it; a removed question ID is a warning, since answers to it will not carry
 * over when people move to this version. The confirmation says what a publish changes.
 */
export function PublishDialog({
  versionNumber,
  result,
  isPending,
  failure,
  onJump,
  onPublish,
  onClose,
}: {
  versionNumber: number;
  result: TemplateValidation;
  isPending: boolean;
  failure: unknown;
  onJump: (nodeId: string) => void;
  onPublish: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["admin", "app"]);
  const blocked = result.errors.length > 0;
  return (
    <Dialog
      isOpen
      isDismissable
      isKeyboardDismissDisabled={isPending}
      size="medium"
      title={t("admin:edit.publish.title", { number: versionNumber })}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && onClose()}
      actions={
        <>
          <Button variant="secondary" onPress={onClose}>
            {blocked ? t("app:close") : t("app:cancel")}
          </Button>
          {blocked ? null : (
            <Button
              variant="accent"
              isPending={isPending}
              pendingLabel={t("app:saving")}
              onPress={onPublish}
            >
              {t("admin:edit.publish.confirm", { number: versionNumber })}
            </Button>
          )}
        </>
      }
    >
      <Stack gap="space-200">
        {failure ? <InlineAlert variant="negative" heading={errorText(t, failure)} /> : null}
        {blocked ? (
          <InlineAlert variant="negative" heading={t("admin:edit.publish.errors")}>
            <RowList aria-label={t("admin:edit.publish.errors")}>
              {result.errors.map((error, index) => (
                // The API gives no id to an issue; the list is read-only and in a fixed order.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                <RowListItem key={index}>
                  <Stack gap="space-100">
                    <Text>{error.message}</Text>
                    {error.nodeId ? (
                      <Button
                        variant="secondary"
                        size="S"
                        onPress={() => {
                          onJump(error.nodeId as string);
                          onClose();
                        }}
                      >
                        {t("admin:edit.publish.goTo")}
                      </Button>
                    ) : null}
                  </Stack>
                </RowListItem>
              ))}
            </RowList>
          </InlineAlert>
        ) : null}
        {result.warnings.map((warning) => (
          <InlineAlert
            key={warning.code}
            variant="notice"
            heading={t("admin:edit.publish.removed", { count: warning.keys.length })}
          >
            <Stack gap="space-100">
              <Text>{t("admin:edit.publish.removedBody")}</Text>
              <Text variant="caption">{warning.keys.join(", ")}</Text>
            </Stack>
          </InlineAlert>
        ))}
        {blocked ? null : <Text>{t("admin:edit.publish.body")}</Text>}
      </Stack>
    </Dialog>
  );
}
