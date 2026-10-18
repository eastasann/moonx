import { AppFrame, SideNav, Skeleton, TabBar } from "@moonx/ui-web";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { type ComponentType, useState, useSyncExternalStore } from "react";
import { PENDING_MS, SlowLoadingState, useIsSlow } from "./states";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /**
     * The screen's skeleton (design-spec 6.0.6「ローディング」): the shape of its layout,
     * drawn in the frame while its route still loads.
     */
    skeleton?: ComponentType;
  }
}

const nothing = () => {};

/**
 * When the load of the location on its way began, as near as the skeleton knows: the
 * session check and then the workspace's load each show it in turn, and the second must
 * not start the 10 seconds again.
 */
let pending: { key: string; since: number } | null = null;

const loadingFor = (key: string) => {
  const now = Date.now();
  if (pending?.key !== key) pending = { key, since: now - PENDING_MS };
  return now - pending.since;
};
const noSubscription = () => nothing;

/**
 * True in the browser, false where the shell is rendered on the server (the dev server
 * and the shell's prerender): the frame's parts measure the page as they render.
 */
const useIsBrowser = () =>
  useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

/**
 * A signed-in screen while its route loads (the user, the workspace): the frame and the
 * screen's own skeleton, which the route declares in `staticData.skeleton`. After 10
 * seconds from the start of the load, "Taking longer than usual" and Retry (6.0.6). The
 * router shows this `PENDING_MS` after the load began.
 */
export function PendingScreen() {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const Body = router.matchRoutes(location).at(-1)?.staticData.skeleton;
  const key = useRouterState({
    select: (state) => state.location.state.__TSR_key ?? state.location.href,
  });
  const [elapsed] = useState(() => loadingFor(key));
  const isSlow = useIsSlow(true, elapsed);
  if (!useIsBrowser()) return null;
  return (
    <AppFrame
      sideNav={
        <Skeleton isLoading>
          <SideNav
            workspaceName=""
            onWorkspacePress={nothing}
            items={[]}
            user={{ name: "" }}
          />
        </Skeleton>
      }
      tabBar={
        <Skeleton isLoading>
          <TabBar items={[]} more={null} />
        </Skeleton>
      }
    >
      {isSlow ? (
        <SlowLoadingState onRetry={() => void router.invalidate()} />
      ) : (
        Body !== undefined && (
          <Skeleton isLoading>
            <Body />
          </Skeleton>
        )
      )}
    </AppFrame>
  );
}
