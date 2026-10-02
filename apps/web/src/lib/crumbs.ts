import type { TFunction } from "i18next";

/** What a route says about its place in the header's trail. */
export type CrumbSource =
  | string
  | ((context: { t: TFunction; params: Record<string, string>; loaderData: unknown }) => string);

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** The route's name in the breadcrumb trail: a catalog key, or a function for a name from data. */
    crumb?: CrumbSource;
  }
}

export interface Crumb {
  label: string;
  href: string;
}

interface MatchLike {
  pathname: string;
  params: unknown;
  loaderData?: unknown;
  staticData?: { crumb?: CrumbSource };
}

/** The trail of the matched routes that name themselves, outermost first. */
export function crumbsOf(matches: readonly MatchLike[], t: TFunction): Crumb[] {
  const crumbs: Crumb[] = [];
  for (const match of matches) {
    const source = match.staticData?.crumb;
    if (!source) continue;
    const label =
      typeof source === "string"
        ? t(source)
        : source({
            t,
            params: match.params as Record<string, string>,
            loaderData: match.loaderData,
          });
    crumbs.push({ label, href: match.pathname });
  }
  return crumbs;
}
