import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import {
  Breadcrumb as AriaBreadcrumb,
  Breadcrumbs as AriaBreadcrumbs,
  type BreadcrumbsProps as AriaBreadcrumbsProps,
  Link,
} from "react-aria-components";
import { breadcrumb, breadcrumbs, link, separator } from "./Breadcrumbs.css";

export interface BreadcrumbsProps<T extends object>
  extends Omit<AriaBreadcrumbsProps<T>, "className" | "style" | "aria-label" | "aria-labelledby"> {
  /** Required: the name of the trail, e.g. "Breadcrumbs". */
  "aria-label": string;
}

/** The path to the current screen in the Web header. Mobile shows a back link instead (design-spec 6.0.1). */
export function Breadcrumbs<T extends object>(props: BreadcrumbsProps<T>) {
  return <AriaBreadcrumbs {...props} className={breadcrumbs} />;
}

export interface BreadcrumbProps {
  /** Omit on the last item: it is the current page and is not a link. */
  href?: string;
  /** Needed when it is not the last item, or when you control the trail with `id`. */
  id?: string;
  children: ReactNode;
}

export function Breadcrumb({ href, children, ...props }: BreadcrumbProps) {
  return (
    <AriaBreadcrumb {...props} className={breadcrumb}>
      {({ isCurrent }) => (
        <>
          <Link href={href} className={link}>
            {children}
          </Link>
          {isCurrent ? null : <ChevronRight aria-hidden="true" className={separator} />}
        </>
      )}
    </AriaBreadcrumb>
  );
}
