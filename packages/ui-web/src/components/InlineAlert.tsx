import type { StatusVariant } from "@moonx/ui-tokens";
import { CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconSlot } from "../internal/IconSlot";
import { ActionButton } from "./ActionButton";
import * as styles from "./InlineAlert.css";

// Spectrum's neutral alert has no icon; the fill alone sets it apart.
const icons = {
  informative: <Info />,
  notice: <TriangleAlert />,
  negative: <CircleAlert />,
} as const satisfies Record<Exclude<StatusVariant, "neutral">, ReactNode>;

export interface InlineAlertProps {
  /**
   * `notice` is the amber of what needs attention (negative margin, Capacity exceeded,
   * the cost floor), `negative` the red of errors (design-spec 4.4).
   * @default "neutral"
   */
  variant?: StatusVariant;
  /** A bold first line. */
  title?: ReactNode;
  /** The message, and any action for it (a Button or a Link). */
  children: ReactNode;
  /** Shows a close button (the bands of a new version and of Add to Home Screen, 6.0.6). */
  onDismiss?: () => void;
}

/**
 * A message in the page: a notice beside what it is about, or a band at the top of the
 * screen (design-spec 4.5・6.0.6). Screen readers announce it when it appears.
 */
export function InlineAlert({
  variant = "neutral",
  title,
  children,
  onDismiss,
}: InlineAlertProps) {
  const { t } = useTranslation(["components"]);
  return (
    <div role="alert" className={styles.alert[variant]}>
      {variant !== "neutral" && (
        // Named, as Spectrum 2 names it, so the kind of alert is not told by colour alone.
        <span
          role="img"
          aria-label={t(`components:inlineAlert.${variant}`)}
          className={styles.icon[variant]}
        >
          <IconSlot size="M">{icons[variant]}</IconSlot>
        </span>
      )}
      <div className={styles.content}>
        {title !== undefined && <div className={styles.heading}>{title}</div>}
        <div>{children}</div>
      </div>
      {onDismiss !== undefined && (
        <span className={styles.close}>
          <ActionButton
            isQuiet
            aria-label={t("components:inlineAlert.close")}
            onPress={onDismiss}
          >
            <X />
          </ActionButton>
        </span>
      )}
    </div>
  );
}
