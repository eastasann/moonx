import { i18n } from "@moonx/i18n";
import type { ReactNode } from "react";
import { BrandMark } from "../internal/BrandMark";
import * as styles from "./patterns.css";

export interface PublicPatternProps {
  /** At the end of the top bar: Log in (a secondary Button or a Link styled as one). */
  action?: ReactNode;
  /** The page's sections: `PublicSection`s, a hairline between them. */
  children: ReactNode;
  /** At the end of the foot: the quiet links to 29 and 30 ("Privacy Policy", "Support"). */
  footerLinks?: ReactNode;
}

/**
 * Pattern J, public page (design-spec 4.1, s01-landing.html): pages that present the app
 * (1, 29, 30). The crescent and "moonx" with Log in across the top, the sections one under
 * another in a centred column, and a foot with "moonx" and the links.
 */
export function PublicPattern({
  action,
  children,
  footerLinks,
}: PublicPatternProps) {
  const name = i18n.t("components:nav.brand");
  return (
    <div className={`${styles.root} ${styles.publicRoot}`}>
      <header className={styles.publicBar}>
        <span className={styles.publicBrand}>
          <BrandMark className={styles.publicBrandMark} />
          {name}
        </span>
        {action != null && (
          <div className={styles.publicBarAction}>{action}</div>
        )}
      </header>
      <div className={styles.publicMain}>{children}</div>
      <footer className={styles.publicFooter}>
        <div className={styles.publicFooterInner}>
          <span>{name}</span>
          {footerLinks != null && (
            <div className={styles.publicFooterLinks}>{footerLinks}</div>
          )}
        </div>
      </footer>
    </div>
  );
}

export interface PublicSectionProps {
  /**
   * `hero`: two columns (6 : 5) in the middle of a window's height; `pair`: text beside an
   * example (5 : 6); `stack`: one under another; `close`: the last words and the action at
   * the end of the line. Two columns stack below `layout.public.split-min-width`.
   * @default "stack"
   */
  layout?: "hero" | "pair" | "stack" | "close";
  /** Its hairline from edge to edge instead of across the column (the three stages). */
  isFullBleed?: boolean;
  /** `hero` and `pair`: the second column (the example). */
  aside?: ReactNode;
  /** `close`: the action at the end of the line (Log in). */
  action?: ReactNode;
  /** The section's heading's id, which names it. */
  "aria-labelledby"?: string;
  children: ReactNode;
}

/** A section of a public page (s01-landing.html .hero, .stages, .pair, .close). */
export function PublicSection({
  layout = "stack",
  isFullBleed = false,
  aside,
  action,
  children,
  ...props
}: PublicSectionProps) {
  const isSplit = layout === "hero" || layout === "pair";
  return (
    <section {...props} className={styles.publicSection({ isFullBleed })}>
      <div className={styles.publicInner({ isFullBleed, layout })}>
        {isSplit ? (
          <>
            <div className={styles.publicColumnStart({ layout })}>
              {children}
            </div>
            <div className={styles.publicColumnEnd({ layout })}>{aside}</div>
          </>
        ) : (
          <>
            {children}
            {layout === "close" && action != null && (
              <div className={styles.publicCloseAction}>{action}</div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
