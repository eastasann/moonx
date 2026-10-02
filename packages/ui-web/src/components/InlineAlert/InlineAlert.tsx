import type { InlineAlertVariant } from "@moonx/ui-tokens";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { body, heading, iconColor, inlineAlert } from "./InlineAlert.css";

export interface InlineAlertProps {
  variant?: InlineAlertVariant;
  /** Short title of the message. */
  heading: ReactNode;
  /** Body under the heading; when empty only the heading is drawn. */
  children?: ReactNode;
  /**
   * `alert` interrupts the reader and `status` waits for a pause; `note` is for a message that is
   * already on the page when it loads. Defaults to `alert` for `negative` and `status` otherwise.
   */
  role?: "alert" | "status" | "note";
}

const icons = {
  informative: Info,
  notice: TriangleAlert,
  negative: CircleAlert,
  neutral: Info,
} as const;

export function InlineAlert({
  variant = "informative",
  heading: headingContent,
  children,
  role,
}: InlineAlertProps) {
  const Icon = icons[variant];
  return (
    <div
      role={role ?? (variant === "negative" ? "alert" : "status")}
      className={inlineAlert({ variant })}
    >
      <Icon aria-hidden="true" className={iconColor({ variant })} />
      <div className={body}>
        <div className={heading}>{headingContent}</div>
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
