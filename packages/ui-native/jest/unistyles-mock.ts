/**
 * A Unistyles v3 stand-in for Jest. The official mock drops `variants`, so tests could not see
 * a component's kind or size; this one resolves them (and breakpoint-keyed values) into plain
 * style objects the way the native runtime does. Tests flip the theme and width with `mockUnistyles`.
 */
import { breakpoints, themes } from "@moonx/ui-tokens/native";

type Style = Record<string, unknown>;
type Variants = Record<string, string | boolean | undefined>;
type ThemeName = keyof typeof themes;

const state = { themeName: "light" as ThemeName, width: 390, adaptive: true };
const listeners = new Set<() => void>();

const breakpointNames = Object.keys(breakpoints) as (keyof typeof breakpoints)[];
const currentBreakpoint = () =>
  [...breakpointNames]
    .sort((a, b) => breakpoints[b] - breakpoints[a])
    .find((name) => state.width >= breakpoints[name]) ?? "mobile";

const isBreakpointMap = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length > 0 &&
  Object.keys(value).every((key) => key in breakpoints);

function resolveBreakpoints(value: unknown): unknown {
  if (isBreakpointMap(value)) {
    const reachable = Object.keys(value)
      .filter((key) => state.width >= breakpoints[key as keyof typeof breakpoints])
      .sort(
        (a, b) =>
          breakpoints[b as keyof typeof breakpoints] - breakpoints[a as keyof typeof breakpoints],
      );
    return reachable.length > 0 ? value[reachable[0] as string] : undefined;
  }
  return value;
}

const miniRuntime = () => ({
  themeName: state.themeName,
  breakpoint: currentBreakpoint(),
  colorScheme: state.themeName,
  hasAdaptiveThemes: state.adaptive,
  insets: { top: 0, left: 0, right: 0, bottom: 0, ime: 0 },
  screen: { width: state.width, height: 800 },
  isLandscape: false,
  isPortrait: true,
  fontScale: 1,
  pixelRatio: 2,
  rtl: false,
});

const theme = () => themes[state.themeName];

function applyVariants(style: Style, selected: Variants): Style {
  const { variants, compoundVariants, ...rest } = style as Style & {
    variants?: Record<string, Record<string, Style>>;
    compoundVariants?: (Variants & { styles: Style })[];
  };
  let out: Style = { ...rest };
  for (const [group, options] of Object.entries(variants ?? {})) {
    const chosen = selected[group];
    const key = chosen === undefined ? "default" : String(chosen);
    const picked = options[key] ?? options.default;
    if (picked) out = { ...out, ...picked };
  }
  for (const compound of compoundVariants ?? []) {
    const { styles, ...conditions } = compound;
    const matches = Object.entries(conditions).every(
      ([group, wanted]) => String(selected[group]) === String(wanted),
    );
    if (matches) out = { ...out, ...styles };
  }
  return out;
}

const finish = (style: Style): Style => {
  const out: Style = {};
  for (const [name, value] of Object.entries(style)) {
    const resolved = resolveBreakpoints(value);
    if (resolved !== undefined) out[name] = resolved;
  }
  return out;
};

function create(factory: unknown) {
  const read = () =>
    typeof factory === "function"
      ? (factory as (t: unknown, rt: unknown) => Record<string, unknown>)(theme(), miniRuntime())
      : (factory as Record<string, unknown>);
  let selected: Variants = {};
  const sheet: Record<string, unknown> = {
    useVariants: (next: Variants) => {
      selected = next;
    },
  };
  for (const name of Object.keys(read())) {
    Object.defineProperty(sheet, name, {
      enumerable: true,
      get() {
        const entry = read()[name];
        if (typeof entry === "function") {
          return (...args: unknown[]) =>
            finish(applyVariants((entry as (...a: unknown[]) => Style)(...args), selected));
        }
        return finish(applyVariants(entry as Style, selected));
      },
    });
  }
  return sheet;
}

const runtime = {
  get themeName() {
    return state.themeName;
  },
  get colorScheme() {
    return state.themeName;
  },
  get breakpoint() {
    return currentBreakpoint();
  },
  get hasAdaptiveThemes() {
    return state.adaptive;
  },
  get miniRuntime() {
    return miniRuntime();
  },
  get insets() {
    return miniRuntime().insets;
  },
  get screen() {
    return miniRuntime().screen;
  },
  getTheme: () => theme(),
  setTheme: (name: ThemeName) => mockUnistyles({ theme: name }),
  setAdaptiveThemes: (value: boolean) => {
    state.adaptive = value;
  },
  updateTheme: () => {},
  setRootViewBackgroundColor: () => {},
};

/** Changes the mocked theme and window width, then re-renders mounted `useUnistyles` readers. */
export function mockUnistyles(next: { theme?: ThemeName; width?: number }): void {
  if (next.theme) state.themeName = next.theme;
  if (next.width !== undefined) state.width = next.width;
  for (const notify of listeners) notify();
}

/** Puts the mock back to the light theme at the width of a phone. */
export function resetMockUnistyles(): void {
  state.themeName = "light";
  state.width = 390;
  state.adaptive = true;
}

export const StyleSheet = {
  configure: () => {},
  create,
  hairlineWidth: 1,
  absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  absoluteFillObject: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  compose: (a: unknown, b: unknown) => [a, b],
  flatten: (style: unknown) => style,
};

export const UnistylesRuntime = runtime;

export function useUnistyles() {
  const React = require("react") as typeof import("react");
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return { theme: theme(), rt: miniRuntime() };
}

export const mq = {
  only: { width: () => "", height: () => "" },
  width: () => "",
  height: () => "",
};

export const withUnistyles = <T>(Component: T) => Component;
export const UnistylesProvider = ({ children }: { children: unknown }) => children;
export const Hide = () => null;
export const Display = ({ children }: { children: unknown }) => children;
