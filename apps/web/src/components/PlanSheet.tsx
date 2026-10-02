import { Button, Dialog, Flex, InlineAlert, Skeleton, Stack, Text } from "@moonx/ui-web";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../lib/error-text";
import { useOverlay } from "../lib/overlay";

/**
 * The frame the plan sheets (M3, M4, M5) show while what they need is read: a skeleton, then the
 * sheet itself, or the reason it could not be read with a retry. Closing it drops `?modal=`.
 */
export function PlanSheetBoundary<Data>({
  query,
  title,
  loadFailed,
  retryLabel,
  children,
}: {
  query: UseQueryResult<Data>;
  title: string;
  loadFailed: string;
  retryLabel: string;
  children: (data: Data) => ReactNode;
}) {
  const { t } = useTranslation(["app", "errors", "auth"]);
  const { closeModal } = useOverlay();
  if (query.data !== undefined) return children(query.data);
  return (
    <Dialog
      isOpen
      isDismissable
      size="medium"
      title={title}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && closeModal()}
    >
      {query.isError ? (
        <InlineAlert variant="negative" heading={loadFailed}>
          <Stack gap="space-100">
            <Text>{errorText(t, query.error)}</Text>
            <Flex>
              <Button variant="secondary" onPress={() => void query.refetch()}>
                {retryLabel}
              </Button>
            </Flex>
          </Stack>
        </InlineAlert>
      ) : (
        <Stack gap="space-100">
          <Skeleton />
          <Skeleton shape="block" height="space-500" />
        </Stack>
      )}
    </Dialog>
  );
}
