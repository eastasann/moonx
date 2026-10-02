import { Flex, Stack, Text } from "@moonx/ui-web";
import type { ReactNode } from "react";

/** One labelled value of a detail pane. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Flex gap="space-200" justify="between" align="baseline" wrap>
      <Text variant="body-sm" tone="secondary" as="span">
        {label}
      </Text>
      <Text variant="body-sm" as="span">
        {children}
      </Text>
    </Flex>
  );
}

/** The labelled values of one record. */
export function DetailRows({ children }: { children: ReactNode }) {
  return <Stack gap="space-100">{children}</Stack>;
}
