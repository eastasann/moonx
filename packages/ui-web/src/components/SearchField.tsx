import { i18n } from "@moonx/i18n";
import type { Size } from "@moonx/ui-tokens";
import { Search, X } from "lucide-react";
import { useRef } from "react";
import {
  SearchField as AriaSearchField,
  type SearchFieldProps as AriaSearchFieldProps,
  Button,
  Input,
  Label,
} from "react-aria-components";
import {
  FieldHelp,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import { FixedLocale } from "../internal/FixedLocale";
import * as styles from "../internal/field.css";
import { IconSlot } from "../internal/IconSlot";
import { useSize } from "../internal/size";
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
  /** @default "M", or "L" inside a spacious `Form` */
  size?: Size;
  /** @default "default" */
  width?: "default" | "full";
  placeholder?: string;
}

/**
 * A search input: Enter submits, Escape or the clear button empties it (lists, the
 * research log search of M2).
 */
export function SearchField({
  label,
  description,
  errorMessage,
  isInvalid,
  size,
  width = "default",
  placeholder,
  ...props
}: SearchFieldProps) {
  const resolved = useSize(size);
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
            {label != null && <Label className={styles.label}>{label}</Label>}
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
                  aria-label={i18n.t("components:searchField.clear")}
                  className={styles.fieldButton({ size: resolved })}
                >
                  <IconSlot size={resolved}>
                    <X />
                  </IconSlot>
                </Button>
              )}
            </div>
            <FieldHelp description={description} errorMessage={errorMessage} />
          </>
        )}
      </AriaSearchField>
    </FixedLocale>
  );
}
