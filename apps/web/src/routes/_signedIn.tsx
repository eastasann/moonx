import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  type ErrorComponentProps,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { PendingScreen } from "../components/PendingScreen";
import { FailureState, StatePage } from "../components/states";
import { ApiError } from "../lib/api";
import { meQuery } from "../lib/queries";
import { setReportedUser } from "../lib/sentry";
import { useDropOtherUsersData } from "../lib/session";

/** The search parameters every signed-in screen takes (SDD 4章). */
export interface SignedInSearch {
  /** The modal open over the screen: `switch-workspace` (M7). */
  modal?: string;
}

/**
 * The screens that need a session (design-spec 5章「認証」). The user (U1) is loaded
 * first; without a session the query cache's 401 handling leaves for
 * `/login?next=<this path>` (router.tsx), so this route only waits for it.
 */
export const Route = createFileRoute("/_signedIn")({
  validateSearch: (search: Record<string, unknown>): SignedInSearch =>
    typeof search.modal === "string" ? { modal: search.modal } : {},
  beforeLoad: async ({ context }) => {
    // What is cached shows at once and is asked again behind it (ADR-011).
    await context.queryClient.ensureQueryData({
      ...meQuery(),
      revalidateIfStale: true,
    });
  },
  pendingComponent: PendingScreen,
  errorComponent: SignedInError,
  component: SignedIn,
});

function SignedIn() {
  const { data: me } = useQuery(meQuery());
  const userId = me?.id ?? null;
  useDropOtherUsersData(userId);
  useEffect(() => {
    setReportedUser(userId);
    return () => setReportedUser(null);
  }, [userId]);
  return <Outlet />;
}

function SignedInError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  // On its way to the sign-in screen.
  if (error instanceof ApiError && error.status === 401) return null;
  return (
    <StatePage>
      <FailureState
        error={error}
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
      />
    </StatePage>
  );
}
