import { i18n } from "@moonx/i18n";
import type { StatusVariant } from "@moonx/ui-tokens";
import { CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { IconSlot } from "../internal/IconSlot";
import { ActionButton } from "./ActionButton";
import * as styles from "./AlertBanner.css";

const icons = {
  informative: <Info />,
  notice: <TriangleAlert />,
  negative: <CircleAlert />,
} as const satisfies Record<Exclude<StatusVariant, "neutral">, ReactNode>;

export interface AlertBannerProps {
  /**
   * Its icon: `informative` (a newer template), `notice` (offline), `negative`; `neutral`
   * has none. The band's ground is the same for all (d1-moon.html .banner).
   * @default "informative"
   */
  variant?: StatusVariant;
  /** The bold start of the message ("A newer template is available."). */
  title?: ReactNode;
  children: ReactNode;
  /** The action at the end of the band: a Link ("Update template") or a Button ("Reload"). */
  action?: ReactNode;
  /** Shows a close button (a new version, Add to Home Screen; 6.0.6). */
  onDismiss?: () => void;
}

/**
 * A band across the top of the body, under the header (design-spec 4.5・6.0.1・6.0.6・
 * 6.0.7): offline, a new version, Add to Home Screen, a newer template. Screen readers
 * announce it when it appears.
 */
export function AlertBanner({
  variant = "informative",
  title,
  children,
  action,
  onDismiss,
}: AlertBannerProps) {
  return (
    <div role="alert" className={styles.banner}>
      {variant !== "neutral" && (
        // Named, as InlineAlert's, so the kind is not told by colour alone.
        <span
          role="img"
          aria-label={i18n.t(`components:inlineAlert.${variant}`)}
          className={styles.icon[variant]}
        >
          <IconSlot size="S">{icons[variant]}</IconSlot>
        </span>
      )}
      <p className={styles.message}>
        {title !== undefined && (
          <>
            <span className={styles.title}>{title}</span>{" "}
          </>
        )}
        {children}
      </p>
      {action !== undefined && <span className={styles.action}>{action}</span>}
      {onDismiss !== undefined && (
        <span className={styles.close}>
          <ActionButton
            isQuiet
            aria-label={i18n.t("components:inlineAlert.close")}
            onPress={onDismiss}
          >
            <X />
          </ActionButton>
        </span>
      )}
    </div>
  );
}
