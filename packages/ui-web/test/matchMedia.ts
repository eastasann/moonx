/**
 * The matchMedia stub used by every test: nothing matches. jsdom has no matchMedia, and the
 * responsive components and the reduced-motion check read it.
 */
export const defaultMatchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

/** Replaces `window.matchMedia` with a stub whose `matches` is `predicate(query)`. */
export function mockMatchMedia(predicate: (query: string) => boolean) {
  window.matchMedia = ((query: string) => ({
    ...defaultMatchMedia(query),
    matches: predicate(query),
  })) as typeof window.matchMedia;
}

/**
 * Makes the `(max-width: ...)` queries match when `isNarrow` is true, as on a viewport below the
 * breakpoint, and none match when it is false. Min-width-only queries never match.
 *
 * Why: the components under test ask one `max-width` question each (tablet or desktop edge), and
 * a test only needs to say narrow or not. The setup file calls {@link restoreMatchMedia} after
 * every test, so a test that mocks it cannot leak the stub into the next one.
 */
export function mockNarrow(isNarrow: boolean) {
  mockMatchMedia((query) => isNarrow && query.includes("max-width"));
}

/** Puts back the default stub installed by the setup file. */
export function restoreMatchMedia() {
  window.matchMedia = defaultMatchMedia;
}
