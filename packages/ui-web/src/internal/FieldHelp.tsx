import { CircleAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { FieldError, Label, Text } from "react-aria-components";
import { useTranslation } from "react-i18next";
import * as styles from "./field.css";
import { IconSlot } from "./IconSlot";
import { lineIcon } from "./lineIcon.css";

/** The props every field takes for the text around its input. */
export interface FieldTextProps {
  /** Visible label. Without one, give the field an `aria-label`. */
  label?: ReactNode;
  /** Help text under the field. */
  description?: ReactNode;
  /**
   * `notice`: the help text is a warning, in amber with its icon (9's "Changing the
   * currency does not convert amounts you already entered.", s09-settings.html).
   * @default "neutral"
   */
  descriptionTone?: "neutral" | "notice";
  /**
   * Why the value is refused (design-spec 6.0.6「入力値が範囲外」), from the screen's Zod
   * check. Giving one marks the field invalid. Without one, an invalid field shows the
   * error the surrounding `Form` holds for its `name`.
   */
  errorMessage?: ReactNode;
  /** Marks the field invalid without a message of its own. */
  isInvalid?: boolean;
}

/** `isInvalid` for React Aria: true when the screen gives a reason. */
export const invalidOf = ({ errorMessage, isInvalid }: FieldTextProps) =>
  isInvalid ??
  (errorMessage != null && errorMessage !== false ? true : undefined);

/**
 * The description and the error under a field. The error carries an icon as well as the
 * colour, so it does not rely on colour alone (design-spec 4.4); the icon sits at the
 * middle of the text's first line (4.5).
 */
export function FieldHelp({
  description,
  descriptionTone = "neutral",
  errorMessage,
}: Pick<FieldTextProps, "description" | "descriptionTone" | "errorMessage">) {
  return (
    <>
      {description != null &&
        (descriptionTone === "notice" ? (
          <Text
            slot="description"
            className={`${styles.description} ${styles.noticeDescription}`}
          >
            <span className={lineIcon}>
              <IconSlot size="XS">
                <TriangleAlert />
              </IconSlot>
            </span>
            <span>{description}</span>
          </Text>
        ) : (
          <Text slot="description" className={styles.description}>
            {description}
          </Text>
        ))}
      <FieldError className={styles.error}>
        {({ validationErrors }) => (
          <>
            <span className={lineIcon}>
              <IconSlot size="XS">
                <CircleAlert />
              </IconSlot>
            </span>
            <span>{errorMessage ?? validationErrors.join(" ")}</span>
          </>
        )}
      </FieldError>
    </>
  );
}

/**
 * A field's label; a required field adds "Required" after it in the secondary colour
 * (s19-decision.html "Why? Required"), as Spectrum 2's `necessityIndicator="label"` does.
 */
export function FieldLabel({
  label,
  isRequired = false,
}: {
  label: ReactNode;
  isRequired?: boolean;
}) {
  const { t } = useTranslation(["components"]);
  return (
    <Label className={styles.label}>
      {label}
      {isRequired && (
        <>
          {" "}
          <span className={styles.necessity}>
            {t("components:field.required")}
          </span>
        </>
      )}
    </Label>
  );
}
