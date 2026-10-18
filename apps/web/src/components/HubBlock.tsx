import { Flex, Heading, Stack, Text } from "@moonx/ui-web";
import { type ReactNode, useId } from "react";

/**
 * A block of a hub (pattern A, design-spec 4.1): its small heading, a note at its end, and
 * what it holds (s05-dashboard.html and d1-moon.html h2 and .aside). The section is busy
 * while it loads.
 */
export function HubBlock({
  title,
  aside,
  isAsideNumeric = false,
  isBusy = false,
  children,
}: {
  title: string;
  aside?: string;
  /** The note is a count ("62 items"): set in the monospaced face (d1-moon.html .num). */
  isAsideNumeric?: boolean;
  isBusy?: boolean;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} aria-busy={isBusy || undefined}>
      <Stack gap="space-100">
        <Flex
          alignItems="baseline"
          justifyContent="space-between"
          gap="space-100"
        >
          <Heading level={2} variant="label" id={headingId}>
            {title}
          </Heading>
          {aside !== undefined && (
            <Text
              variant={isAsideNumeric ? "number-sm" : "caption"}
              tone="tertiary"
            >
              {aside}
            </Text>
          )}
        </Flex>
        {children}
      </Stack>
    </section>
  );
}
