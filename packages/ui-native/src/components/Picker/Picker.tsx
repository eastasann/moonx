import { type ReactNode, useMemo } from "react";
import {
  FieldHelp,
  FieldLabel,
  type FieldProps,
  FieldRoot,
  fieldAccessibility,
  textOf,
} from "../../internal/FieldParts";
import { useControlledState } from "../../internal/useControlledState";
import { Tray } from "../Tray";
import {
  collectOptions,
  OptionItem,
  type OptionItemProps,
  OptionList,
  OptionTrigger,
  optionText,
} from "./OptionList";

export interface PickerProps extends FieldProps {
  /** Text shown while nothing is chosen. */
  placeholder?: string;
  /** The `id` of the chosen item, or `null` for none. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  /** Required. `PickerItem` items only, placed directly or inside fragments. */
  children: ReactNode;
  isDisabled?: boolean;
  /** `id`s of the items that cannot be chosen. */
  disabledKeys?: Iterable<string>;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** Accessible name when it must differ from `label`. */
  "aria-label"?: string;
  testID?: string;
}

export type PickerItemProps = OptionItemProps;
export const PickerItem = OptionItem;

/**
 * Always opens as a tray on the phone (design-spec 4.5). The Web `name`, `autoFocus` and
 * collection props (`items`, `selectionMode`, `shouldFlip`, `menuWidth`) have no use here; the
 * value text is the item's `textValue` or the text of its children, so an icon inside an item is
 * shown in the list only.
 */
export function Picker({
  label,
  description,
  errorMessage,
  isInvalid,
  isRequired,
  isLabelHidden,
  size = "M",
  placeholder,
  value,
  defaultValue = null,
  onChange,
  children,
  isDisabled = false,
  disabledKeys,
  isOpen,
  defaultOpen = false,
  onOpenChange,
  "aria-label": ariaLabel,
  testID,
}: PickerProps) {
  const [selected, setSelected] = useControlledState<string | null>(value, defaultValue, onChange);
  const [open, setOpen] = useControlledState(isOpen, defaultOpen, onOpenChange);
  const options = collectOptions(children);
  const disabledIds = useMemo(() => new Set(disabledKeys ?? []), [disabledKeys]);
  const chosen = options.find((option) => option.props.id === selected);
  const name = ariaLabel ?? textOf(label);

  return (
    <FieldRoot size={size} isDisabled={isDisabled} isInvalid={isInvalid}>
      <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden}>
        {label}
      </FieldLabel>
      <Tray
        aria-label={name}
        isOpen={open}
        onOpenChange={setOpen}
        trigger={
          <OptionTrigger
            role="button"
            isOpen={open}
            text={chosen ? optionText(chosen.props) : ""}
            placeholder={placeholder}
            testID={testID}
            accessibility={fieldAccessibility({
              label,
              description,
              errorMessage,
              isInvalid,
              ariaLabel,
            })}
          />
        }
      >
        {({ close }) => (
          <OptionList
            aria-label={name}
            options={options}
            size={size}
            selectedId={selected}
            disabledIds={disabledIds}
            onChoose={(id) => {
              setSelected(id);
              close();
            }}
          />
        )}
      </Tray>
      <FieldHelp description={description} errorMessage={errorMessage} isInvalid={isInvalid} />
    </FieldRoot>
  );
}
