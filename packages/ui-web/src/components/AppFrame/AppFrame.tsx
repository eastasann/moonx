import type { ReactNode } from "react";
import {
  breadcrumbs,
  column,
  header,
  lead,
  main,
  mobileTitle,
  root,
  skipLink,
  tools,
} from "./AppFrame.css";

export interface AppFrameProps {
  /** Accessible text of the "skip to main content" link. */
  skipLabel: string;
  /** The `SideNav`. It hides itself below tablet width. */
  sideNav: ReactNode;
  /** The `TabBar`. It hides itself from tablet width up. */
  tabBar: ReactNode;
  /** The `Breadcrumbs` trail, shown from tablet width up. */
  breadcrumbs?: ReactNode;
  /** The back link shown below tablet width, before `title`. */
  backLink?: ReactNode;
  /** Name of the current screen, shown below tablet width. */
  title?: ReactNode;
  /** Save state, at the end of the header. */
  status?: ReactNode;
  /** Header entries: the Comments and History panel buttons. */
  actions?: ReactNode;
  /** A notice above the header, such as the offline message. */
  banner?: ReactNode;
  /**
   * Shows the frame inside another page, as the component gallery does: the content area is a
   * plain `div` instead of the `main` landmark, and the skip link is left out.
   */
  isEmbedded?: boolean;
  children: ReactNode;
}

/**
 * The frame of every signed-in screen (design-spec 6.0.1): the sidebar on tablet and wider, the
 * tab bar below it, and the header with the trail, the save state and the panel entries.
 */
export function AppFrame({
  skipLabel,
  sideNav,
  tabBar,
  breadcrumbs: trail,
  backLink,
  title,
  status,
  actions,
  banner,
  isEmbedded = false,
  children,
}: AppFrameProps) {
  const Content = isEmbedded ? "div" : "main";
  return (
    <div className={root}>
      {isEmbedded ? null : (
        <a href="#main-content" className={skipLink}>
          {skipLabel}
        </a>
      )}
      {sideNav}
      <div className={column}>
        {banner}
        <header className={header}>
          <div className={lead}>
            {trail ? <div className={breadcrumbs}>{trail}</div> : null}
            {backLink || title ? (
              <div className={mobileTitle}>
                {backLink}
                {title}
              </div>
            ) : null}
          </div>
          <div className={tools}>
            {status}
            {actions}
          </div>
        </header>
        <Content
          id={isEmbedded ? undefined : "main-content"}
          tabIndex={isEmbedded ? undefined : -1}
          className={main}
        >
          {children}
        </Content>
      </div>
      {tabBar}
    </div>
  );
}
