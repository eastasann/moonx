import { RouterProvider as AriaRouterProvider } from "react-aria-components";

export interface RouterProviderProps {
  /** Called when a `Link`, `MenuItem` or `Breadcrumb` with an `href` is pressed. */
  navigate: (href: string) => void;
  /** Turns an `href` into the URL the link shows, for example with the router's base path. */
  useHref: (href: string) => string;
  children: React.ReactNode;
}

/**
 * Makes every component with an `href` navigate through the app's router instead of loading the
 * page again. Mount it once, near the root.
 */
export function RouterProvider({ navigate, useHref, children }: RouterProviderProps) {
  return (
    <AriaRouterProvider navigate={(href) => navigate(href)} useHref={useHref}>
      {children}
    </AriaRouterProvider>
  );
}
