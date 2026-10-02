import { Button, Flex, InlineAlert, Skeleton, Stack } from "@moonx/ui-web";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState } from "../../components/states";

/** The part of an infinite query a paged list reads. */
export interface PagedQuery<Row> {
  data: { pages: { items: Row[] }[] } | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => unknown;
  refetch: () => unknown;
}

/** The rows of every page loaded so far. */
export const rowsOf = <Row,>(query: PagedQuery<Row>): Row[] =>
  query.data?.pages.flatMap((page) => page.items) ?? [];

function ListSkeleton() {
  return (
    <Stack gap="space-200">
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} shape="block" height="space-800" />
      ))}
    </Stack>
  );
}

/**
 * Loading, failure and "Load more" around the rows of an admin list. A failed read keeps the rows
 * already on screen and shows the failure of the next page above the button.
 */
export function PagedList<Row>({
  query,
  children,
}: {
  query: PagedQuery<Row>;
  children: (rows: Row[]) => ReactNode;
}) {
  const { t } = useTranslation("admin");
  if (query.isPending) {
    return <LoadingState skeleton={<ListSkeleton />} onRetry={() => void query.refetch()} />;
  }
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  return (
    <Stack gap="space-200">
      {children(rowsOf(query))}
      {query.isFetchNextPageError ? (
        <InlineAlert variant="negative" heading={t("list.loadMoreFailed")} />
      ) : null}
      {query.hasNextPage ? (
        <Flex justify="center">
          <Button
            variant="secondary"
            isPending={query.isFetchingNextPage}
            pendingLabel={t("list.loadingMore")}
            onPress={() => void query.fetchNextPage()}
          >
            {t("list.loadMore")}
          </Button>
        </Flex>
      ) : null}
    </Stack>
  );
}
