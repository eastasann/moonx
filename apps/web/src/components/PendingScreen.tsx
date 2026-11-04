import { AppFrame, SideNav, Skeleton, TabBar } from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import {
  type AnyRouter,
  type ParsedLocation,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { type ComponentType, useState, useSyncExternalStore } from "react";
import { dropRouteReads } from "../lib/query";
import { useNewVersionBanner } from "./pwaBanners";
import { useOfflineBanner } from "./StandaloneFrame";
import { StandaloneLoading } from "./StandaloneLoading";
import { SlowLoadingState, useSlowRetry } from "./states";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /**
     * The screen's skeleton (design-spec 6.0.6「ローディング」): the shape of its layout,
     * drawn in the frame while its route still loads. Taken from the screen's
     * `<Screen>Skeleton.tsx`, never from the screen's own module: a route's static data
     * loads with every page (SDD 7.3, which the Web's build checks).
     */
    skeleton?: ComponentType;
    /** A screen drawn without AppFrame (3, design-spec 4.5 PageFrame), and so its skeleton. */
    isStandalone?: boolean;
    /** The route shows its toasts itself (the component gallery), not in the root's. */
    hasOwnToasts?: boolean;
  }
}

const nothing = () => {};

/**
 * When the load of each router's location on its way began ({@link watchLoads}): the
 * session check and then the workspace's load each show the skeleton in turn, and the
 * second must not start the 10 seconds again.
 */
const loads = new WeakMap<AnyRouter, { key: string; since: number }>();

const keyOf = (location: ParsedLocation) =>
  location.state.__TSR_key ?? location.href;

/**
 * How long the load of the location `key` names has run. A skeleton drawn before its
 * load began counts from itself: the page's first, which shows as the shell hydrates,
 * just before the router starts the load.
 */
const loadingFor = (router: AnyRouter, key: string) => {
  const load = loads.get(router);
  return load?.key === key ? Date.now() - load.since : 0;
};

/**
 * Keeps {@link loads} to the router's loads from the router's creation (createAppRouter),
 * so a skeleton that shows at once, without the pending time, counts from its load's start
 * too: Retry on an error that came before any skeleton showed, say. Each load starts it,
 * and its end (the screen or its error shown) ends it, so a later load of the same entry
 * counts from its own start. Not as a skeleton unmounts: the workspace's follows the
 * session check's within the same load. A load superseded (by Retry) does not end it.
 */
export function watchLoads(router: AnyRouter): void {
  router.subscribe("onBeforeLoad", ({ toLocation }) => {
    loads.set(router, { key: keyOf(toLocation), since: Date.now() });
  });
  router.subscribe("onResolved", () => {
    loads.delete(router);
  });
}

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
 * seconds from the start of the load, "Taking longer than usual" and Retry (6.0.6), which
 * drops the reads the load waits for and loads the route again: the skeleton again, for
 * 10 seconds from the press. The router shows this `PENDING_MS` after the load began.
 */
export function PendingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const location = useRouterState({ select: (state) => state.location });
  const target = router.matchRoutes(location).at(-1)?.staticData;
  const Body = target?.skeleton;
  const key = useRouterState({ select: (state) => keyOf(state.location) });
  const [elapsed] = useState(() => loadingFor(router, key));
  // The load run again starts the count anew (watchLoads).
  const askAgain = () => {
    dropRouteReads(queryClient);
    void router.invalidate();
  };
  const { isSlow, retry } = useSlowRetry(true, askAgain, elapsed);
  const isBrowser = useIsBrowser();
  // Before the user is known: the bands of every screen, not iPhone's Home Screen hint.
  const offline = useOfflineBanner();
  const newVersion = useNewVersionBanner();
  if (!isBrowser) return null;
  if (target?.isStandalone === true) {
    return (
      <StandaloneLoading since={elapsed} onRetry={askAgain}>
        {Body !== undefined && <Body />}
      </StandaloneLoading>
    );
  }
  return (
    <AppFrame
      sideNav={
        <Skeleton isLoading>
          <SideNav
            workspaceName=""
            onWorkspacePress={nothing}
            items={[]}
            user={{ name: "" }}
            userMenu={null}
          />
        </Skeleton>
      }
      tabBar={
        <Skeleton isLoading>
          <TabBar items={[]} more={null} />
        </Skeleton>
      }
      banners={{ offline, newVersion }}
    >
      {isSlow ? (
        <SlowLoadingState onRetry={retry} />
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
