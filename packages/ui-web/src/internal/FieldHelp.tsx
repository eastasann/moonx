import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { FieldError, Text } from "react-aria-components";
import * as styles from "./field.css";
import { IconSlot } from "./IconSlot";

/** The props every field takes for the text around its input. */
export interface FieldTextProps {
  /** Visible label. Without one, give the field an `aria-label`. */
  label?: ReactNode;
  /** Help text under the field. */
  description?: ReactNode;
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
 * colour, so it does not rely on colour alone (design-spec 4.4).
 */
export function FieldHelp({
  description,
  errorMessage,
}: Pick<FieldTextProps, "description" | "errorMessage">) {
  return (
    <>
      {description != null && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>
        {({ validationErrors }) => (
          <>
            <IconSlot size="XS">
              <CircleAlert />
            </IconSlot>
            <span>{errorMessage ?? validationErrors.join(" ")}</span>
          </>
        )}
      </FieldError>
    </>
  );
}
