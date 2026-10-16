import type { ReactNode } from "react";
import {
  RouterProvider as AriaRouterProvider,
  type RouterProvider as AriaRouterProviderType,
} from "react-aria-components";

type AriaRouterProviderProps = Parameters<typeof AriaRouterProviderType>[0];

export interface RouterProviderProps {
  /**
   * Moves to `href` through the app's router. `routerOptions` are what the component
   * was given (Link's and MenuItem's `routerOptions`).
   */
  navigate: AriaRouterProviderProps["navigate"];
  /** Turns an `href` into the URL the link's element shows, when the router rewrites it. */
  useHref?: AriaRouterProviderProps["useHref"];
  children: ReactNode;
}

/**
 * Makes every component with an `href` (Link, MenuItem, Breadcrumb, the SideNav and
 * TabBar items) move through the app's router instead of loading the page
 * (design-spec 4.5). One goes at the root of the app. Links that open a new tab, or that
 * are pressed with a modifier key, are left to the browser.
 */
export function RouterProvider({
  navigate,
  useHref,
  children,
}: RouterProviderProps) {
  return (
    <AriaRouterProvider navigate={navigate} useHref={useHref}>
      {children}
    </AriaRouterProvider>
  );
}
