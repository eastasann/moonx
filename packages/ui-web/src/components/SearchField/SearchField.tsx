import { Search, X } from "lucide-react";
import {
  SearchField as AriaSearchField,
  type SearchFieldProps as AriaSearchFieldProps,
  Button,
  Group,
  Input,
} from "react-aria-components";
import { FieldHelp, FieldLabel, type FieldProps } from "../_internal/FieldParts";
import { bareInput, box, fieldRoot, icon, inlineButton } from "../_internal/field.css";

export interface SearchFieldProps
  extends FieldProps,
    Omit<
      AriaSearchFieldProps,
      "className" | "style" | "children" | "validationBehavior" | "validate" | keyof FieldProps
    > {
  placeholder?: string;
  /** Accessible name of the clear button. */
  clearLabel: string;
}

export function SearchField({
  label,
  description,
  errorMessage,
  isRequired,
  size = "M",
  placeholder,
  clearLabel,
  ...props
}: SearchFieldProps) {
  return (
    <AriaSearchField
      {...props}
      isRequired={isRequired}
      validationBehavior="aria"
      className={fieldRoot({ size })}
    >
      {({ isEmpty, isInvalid, isDisabled }) => (
        <>
          <FieldLabel isRequired={isRequired} size={size}>
            {label}
          </FieldLabel>
          <Group
            role="presentation"
            isInvalid={isInvalid}
            isDisabled={isDisabled}
            className={box({ size })}
          >
            <Search aria-hidden="true" className={icon({ size })} />
            <Input placeholder={placeholder} className={bareInput} />
            {isEmpty ? null : (
              <Button aria-label={clearLabel} className={inlineButton}>
                <X aria-hidden="true" className={icon({ size })} />
              </Button>
            )}
          </Group>
          <FieldHelp description={description} errorMessage={errorMessage} />
        </>
      )}
    </AriaSearchField>
  );
}
