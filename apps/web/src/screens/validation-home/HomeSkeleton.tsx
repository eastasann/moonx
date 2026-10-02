import { Grid, HubPattern, Skeleton, Stack } from "@moonx/ui-web";

/** The shape of the home while it loads: key numbers, checks and sections (design-spec 6.0.6). */
export function HomeSkeleton() {
  return (
    <HubPattern
      header={
        <Stack gap="space-100">
          <Skeleton width="space-1000" />
          <Skeleton width="space-900" />
        </Stack>
      }
      summary={
        <Grid columns={2} gap="space-200">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} shape="block" height="space-700" />
          ))}
        </Grid>
      }
      status={
        <Stack gap="space-200">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} />
          ))}
        </Stack>
      }
      entries={
        <Stack gap="space-200">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
            <Skeleton key={n} shape="block" height="space-500" />
          ))}
        </Stack>
      }
    />
  );
}
