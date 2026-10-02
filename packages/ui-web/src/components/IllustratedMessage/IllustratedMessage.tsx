import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { actions, description, heading, icon, illustratedMessage } from "./IllustratedMessage.css";

export interface IllustratedMessageProps {
  /** A Lucide icon component, e.g. `Inbox`. Decorative. */
  icon: LucideIcon;
  heading: ReactNode;
  /** Rendered inside a `<p>` under the heading, so pass inline content only. */
  children?: ReactNode;
  /** Slot for the next step, usually a Button or a Link. */
  actions?: ReactNode;
  /** The heading's level in the page outline. */
  headingLevel?: 2 | 3 | 4;
}

/** The empty, zero-result, no-permission and not-found states (design-spec 6.0.6). */
export function IllustratedMessage({
  icon: Icon,
  heading: headingContent,
  children,
  actions: actionsContent,
  headingLevel = 2,
}: IllustratedMessageProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={illustratedMessage}>
      <Icon aria-hidden="true" className={icon} />
      <Heading className={heading}>{headingContent}</Heading>
      {children ? <p className={description}>{children}</p> : null}
      {actionsContent ? <div className={actions}>{actionsContent}</div> : null}
    </div>
  );
}
