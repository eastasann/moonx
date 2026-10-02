import { Skeleton, Stack } from "@moonx/ui-web";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { QueryBoundary } from "../../components/states";
import { BlockHeading } from "../validation-home/BlockHeading";

function BlockSkeleton() {
  return (
    <Stack gap="space-100">
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} shape="block" height="space-600" />
      ))}
    </Stack>
  );
}

/**
 * One block of the dashboard. Each block reads its own query, so one that fails shows its error
 * state in its place while the others still show their data (design-spec 6.9).
 */
export function DashboardBlock<Data>({
  title,
  query,
  children,
}: {
  title: string;
  query: UseQueryResult<Data>;
  children: (data: Data) => ReactNode;
}) {
  return (
    <Stack gap="space-100" as="section">
      <BlockHeading>{title}</BlockHeading>
      <QueryBoundary query={query} skeleton={<BlockSkeleton />}>
        {children}
      </QueryBoundary>
    </Stack>
  );
}
