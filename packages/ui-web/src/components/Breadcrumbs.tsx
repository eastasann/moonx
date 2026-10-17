import type { BreadcrumbsSize } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useContext } from "react";
import {
  Breadcrumb as AriaBreadcrumb,
  type BreadcrumbProps as AriaBreadcrumbProps,
  Breadcrumbs as AriaBreadcrumbs,
  Link,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import * as styles from "./Breadcrumbs.css";

const BreadcrumbsSizeContext = createContext<BreadcrumbsSize>("M");

export interface BreadcrumbsProps {
  /** @default "M" */
  size?: BreadcrumbsSize;
  /** @default the catalog's "Breadcrumbs" */
  "aria-label"?: string;
  /** `Breadcrumb`s, from the top level to the current page. */
  children: ReactNode;
}

/**
 * Where the page sits: "Ideas / Piaya Gift Box / 05 Costs" (design-spec 6.0.1). Shown on
 * tablet and wider only; below that the component hides itself.
 */
export function Breadcrumbs({
  size = "M",
  "aria-label": label,
  children,
}: BreadcrumbsProps) {
  const { t } = useTranslation(["components"]);
  return (
    <BreadcrumbsSizeContext.Provider value={size}>
      <AriaBreadcrumbs
        aria-label={label ?? t("components:breadcrumbs.label")}
        className={styles.list[size]}
      >
        {children}
      </AriaBreadcrumbs>
    </BreadcrumbsSizeContext.Provider>
  );
}

export interface BreadcrumbProps extends Pick<AriaBreadcrumbProps, "id"> {
  /** The level's page. The last crumb is the current page and takes none. */
  href?: string;
  children: ReactNode;
}

/**
 * One level. `href` moves through the app's router (design-spec 4.5 RouterProvider); the
 * last crumb is the current page, as text.
 */
export function Breadcrumb({ href, children, ...props }: BreadcrumbProps) {
  const { t } = useTranslation(["components"]);
  const size = useContext(BreadcrumbsSizeContext);
  return (
    <AriaBreadcrumb {...props} className={styles.item[size]}>
      {({ isCurrent }) =>
        isCurrent ? (
          // The current page is text, not a link (as Spectrum 2's).
          <span
            aria-current="page"
            className={`${styles.link} ${styles.linkSize[size]} ${styles.current}`}
          >
            {children}
          </span>
        ) : (
          <>
            <Link
              href={href}
              className={`${styles.link} ${styles.linkSize[size]}`}
            >
              {children}
            </Link>
            <span className={styles.separator} aria-hidden="true">
              {t("components:breadcrumbs.separator")}
            </span>
          </>
        )
      }
    </AriaBreadcrumb>
  );
}
