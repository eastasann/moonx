import type { Size } from "@moonx/ui-tokens";
import { Search, X } from "lucide-react";
import { useRef } from "react";
import {
  SearchField as AriaSearchField,
  type SearchFieldProps as AriaSearchFieldProps,
  Button,
  Input,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import {
  FieldHelp,
  FieldLabel,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import { FixedLocale } from "../internal/FixedLocale";
import * as styles from "../internal/field.css";
import { IconSlot } from "../internal/IconSlot";
import { useFieldWidth, useSize } from "../internal/size";
import { useKeepAboveKeyboard } from "../internal/useKeepAboveKeyboard";

export interface SearchFieldProps
  extends FieldTextProps,
    Pick<
      AriaSearchFieldProps,
      | "value"
      | "defaultValue"
      | "onChange"
      | "onSubmit"
      | "onClear"
      | "name"
      | "isDisabled"
      | "autoFocus"
      | "id"
      | "aria-label"
      | "aria-labelledby"
    > {
  /** @default "M"; "L" in a spacious pattern, dialog or `Form` (06 semantic.density) */
  size?: Size;
  /**
   * `full` fills the line, `fill` grows into the rest of a line of filters (pattern D);
   * otherwise the size's default width.
   * @default "default"
   */
  width?: "default" | "full" | "fill";
  placeholder?: string;
}

/**
 * A search input: Enter submits, Escape or the clear button empties it (lists, the
 * research log search of M2).
 */
export function SearchField({
  label,
  description,
  descriptionTone,
  errorMessage,
  isInvalid,
  size,
  width: givenWidth,
  placeholder,
  ...props
}: SearchFieldProps) {
  const { t } = useTranslation(["components"]);
  const resolved = useSize(size);
  const width = useFieldWidth(givenWidth);
  const frameRef = useRef<HTMLDivElement>(null);
  useKeepAboveKeyboard(frameRef);
  return (
    <FixedLocale>
      <AriaSearchField
        {...props}
        isInvalid={invalidOf({ errorMessage, isInvalid })}
        validationBehavior="aria"
        className={styles.fieldRoot({ size: resolved, width })}
      >
        {({ isEmpty }) => (
          <>
            {label != null && <FieldLabel label={label} />}
            <div ref={frameRef} className={styles.frame({ size: resolved })}>
              <span className={styles.affix}>
                <IconSlot size={resolved}>
                  <Search />
                </IconSlot>
              </span>
              <Input
                className={`${styles.input} ${styles.searchInput}`}
                placeholder={placeholder}
              />
              {!isEmpty && (
                <Button
                  aria-label={t("components:searchField.clear")}
                  className={styles.fieldButton({ size: resolved })}
                >
                  <IconSlot size={resolved}>
                    <X />
                  </IconSlot>
                </Button>
              )}
            </div>
            <FieldHelp
              description={description}
              descriptionTone={descriptionTone}
              errorMessage={errorMessage}
            />
          </>
        )}
      </AriaSearchField>
    </FixedLocale>
  );
}
