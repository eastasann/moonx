import type { ReactNode } from "react";

export interface BreadcrumbsProps {
  /** Required: the name of the trail, e.g. "Breadcrumbs". */
  "aria-label": string;
  /** `Breadcrumb`s. Never drawn on the phone. */
  children?: ReactNode;
}

/**
 * Renders nothing on the phone: the trail is for the Web header, and design-spec 4.5 has the
 * phone screen show a back arrow instead, which the screen draws itself. The part exists so
 * a screen written once per platform keeps the same vocabulary. The Web part's collection props
 * (`items`, `onAction`, `isDisabled`) have no meaning without a trail and are not accepted.
 */
export function Breadcrumbs(_props: BreadcrumbsProps): null {
  return null;
}

export interface BreadcrumbProps {
  /** Omit on the last item: it is the current page. Unused on the phone; there is no trail. */
  href?: string;
  /** Needed when it is not the last item. Unused on the phone. */
  id?: string;
  children: ReactNode;
}

/** One step of the trail. Renders nothing on the phone, see `Breadcrumbs`. */
export function Breadcrumb(_props: BreadcrumbProps): null {
  return null;
}
