import { useSyncExternalStore } from "react";
import { reportError } from "./sentry";
import { SKIP_WAITING } from "./sw-messages";

/**
 * How often an open page asks the server for a new service worker, besides each time it
 * comes back into view: an app left open for days moves between screens without
 * loading a page, which is when the browser would ask on its own.
 */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

type Listener = () => void;

/**
 * A value the screens follow with `useSyncExternalStore`, read from `initial` the first
 * time it is asked for.
 */
function createStore<T>(initial: () => T) {
  let value: { current: T } | null = null;
  const listeners = new Set<Listener>();
  return {
    get() {
      value ??= { current: initial() };
      return value.current;
    },
    set(next: T) {
      value = { current: next };
      for (const listener of listeners) listener();
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The band of design-spec 6.0.6「新しい版がある」. */
interface NewVersionState {
  /**
   * A new version waits, or has taken over from the one this page runs (another tab
   * chose Reload, or this page's reload was cancelled to keep unsaved input).
   */
  isAvailable: boolean;
  /** Closed on this page; it shows again when a page opens (design-spec 6.0.6). */
  isDismissed: boolean;
}

const newVersion = createStore<NewVersionState>(() => ({
  isAvailable: false,
  isDismissed: false,
}));

/** What {@link registerServiceWorker} found, for Reload. */
let worker: {
  registration: ServiceWorkerRegistration;
  reloadOnTakeover: boolean;
} | null = null;

/** How the page reloads; set as the page starts following its worker. */
let reloadPage: () => void = () => {};

/** The browser parts {@link registerServiceWorker} talks to; tests pass their own. */
export interface ServiceWorkerHost {
  container: ServiceWorkerContainer;
  document: Pick<Document, "visibilityState" | "addEventListener">;
  reload: () => void;
  setInterval: (callback: () => void, ms: number) => unknown;
}

const browserHost = (): ServiceWorkerHost => ({
  container: navigator.serviceWorker,
  document,
  reload: () => window.location.reload(),
  setInterval: (callback, ms) => window.setInterval(callback, ms),
});

/**
 * Registers `/sw.js` (ADR-031) and follows its versions: a new one that waits shows the
 * band of design-spec 6.0.6, and takes over only when the user chooses Reload. Only the
 * production build calls this, never Vite's dev server.
 */
export async function registerServiceWorker(
  host: ServiceWorkerHost = browserHost(),
): Promise<void> {
  const { container } = host;
  reloadPage = host.reload;
  // Whether a version was active before this page: if not, the page is on the first
  // install, and that one taking the page (src/sw.ts claims it) is no new version. A
  // page opened with Shift+Reload has no controller though a version is active, so the
  // registration settles it once known.
  let hadActive = container.controller !== null;
  container.addEventListener("controllerchange", () => {
    if (worker?.reloadOnTakeover === true) {
      worker.reloadOnTakeover = false;
      host.reload();
    }
    if (hadActive) {
      newVersion.set({ ...newVersion.get(), isAvailable: true });
    }
  });

  let registration: ServiceWorkerRegistration;
  try {
    registration = await container.register("/sw.js", { scope: "/" });
  } catch (error) {
    // The page works without it, only with nothing to show offline. A deploy whose
    // /sw.js fails is worth knowing about; a browser set to refuse service workers
    // (SecurityError) is the user's choice, not a failure.
    if (!(error instanceof DOMException && error.name === "SecurityError")) {
      reportError(error);
    }
    return;
  }
  worker = { registration, reloadOnTakeover: false };
  hadActive ||= registration.active !== null;

  // On the first install the worker is installed with no version active yet.
  const showIfWaiting = () => {
    if (registration.waiting !== null && registration.active !== null) {
      newVersion.set({ ...newVersion.get(), isAvailable: true });
    }
  };
  showIfWaiting();
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed") showIfWaiting();
    });
  });

  const checkForUpdate = () => {
    // Fails offline or while the server is unreachable, and the next check asks again;
    // nothing on the page depends on this one. A /sw.js a deploy broke is caught by the
    // check after each deploy (04_deployment-procedure.md) and by register() above in
    // every browser that does not have the worker yet.
    registration.update().catch(() => {});
  };
  host.document.addEventListener("visibilitychange", () => {
    if (host.document.visibilityState === "visible") checkForUpdate();
  });
  host.setInterval(checkForUpdate, UPDATE_CHECK_MS);
}

/**
 * Moves the page to the new version: the waiting worker takes over, then the page
 * reloads, which asks first while input is unsaved (design-spec 6.0.2). With none
 * waiting (it took over already), the page just reloads.
 */
function reloadToNewVersion() {
  const waiting = worker?.registration.waiting ?? null;
  if (worker === null || waiting === null) {
    reloadPage();
    return;
  }
  worker.reloadOnTakeover = true;
  waiting.postMessage(SKIP_WAITING);
}

const dismissNewVersion = () =>
  newVersion.set({ ...newVersion.get(), isDismissed: true });

// What the prerendered HTML was drawn with, which hydration must match: no band.
const NO_NEW_VERSION: NewVersionState = {
  isAvailable: false,
  isDismissed: false,
};
const noNewVersion = () => NO_NEW_VERSION;

/** The band of design-spec 6.0.6「新しい版がある」: whether it shows, Reload and close. */
export function useNewVersion() {
  const { isAvailable, isDismissed } = useSyncExternalStore(
    newVersion.subscribe,
    newVersion.get,
    noNewVersion,
  );
  return {
    isShown: isAvailable && !isDismissed,
    reload: reloadToNewVersion,
    dismiss: dismissNewVersion,
  };
}

// Tokens of the browsers on iOS that are not Safari, though their user agents copy its
// `Version/` and `Safari/` tokens: Edge, Opera, DuckDuckGo, Yandex and the Google app.
// Chrome (CriOS) and Firefox (FxiOS) carry no `Version/`, nor do apps' web views.
const OTHER_IOS_BROWSERS =
  /\b(CriOS|FxiOS|EdgiOS|OPiOS|OPT|Ddg|YaBrowser|GSA)\//;

/**
 * Whether the user agent is Safari on an iPhone (design-spec 6.0.6「ホーム画面への追加の
 * 案内」). iPads are left out, as are the other browsers on iOS.
 */
export function isIPhoneSafari(userAgent: string): boolean {
  return (
    /\biPhone\b/.test(userAgent) &&
    /\bVersion\/[\d.]+\b/.test(userAgent) &&
    /\bSafari\//.test(userAgent) &&
    !OTHER_IOS_BROWSERS.test(userAgent)
  );
}

/** Where the browser remembers that the hint was closed (design-spec 6.0.6). */
export const ADD_TO_HOME_SCREEN_DISMISSED =
  "moonx:add-to-home-screen-dismissed";

/** Opened from the home screen: iPhone's own flag, or the manifest's display mode. */
const isStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  window.matchMedia("(display-mode: standalone)").matches;

const addToHomeScreen = createStore(
  () =>
    isIPhoneSafari(navigator.userAgent) &&
    !isStandalone() &&
    localStorage.getItem(ADD_TO_HOME_SCREEN_DISMISSED) === null,
);

const dismissAddToHomeScreen = () => {
  localStorage.setItem(ADD_TO_HOME_SCREEN_DISMISSED, "1");
  addToHomeScreen.set(false);
};

const hiddenOnServer = () => false;

/**
 * The hint of design-spec 6.0.6「ホーム画面への追加の案内」: shown in iPhone's Safari
 * when the page was not opened from the home screen, until the user closes it, which
 * this browser then remembers.
 */
export function useAddToHomeScreen() {
  const isShown = useSyncExternalStore(
    addToHomeScreen.subscribe,
    addToHomeScreen.get,
    hiddenOnServer,
  );
  return { isShown, dismiss: dismissAddToHomeScreen };
}
