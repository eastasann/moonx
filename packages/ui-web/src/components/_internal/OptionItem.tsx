import { Check } from "lucide-react";
import { type ReactNode, useContext } from "react";
import { ListBoxItem } from "react-aria-components";
import { icon, listItem } from "./field.css";
import { SizeContext } from "./SizeContext";
import { TrayChoiceContext } from "./TrayChoiceContext";

export interface OptionItemProps {
  id: string;
  children: ReactNode;
  /** Plain text of the option, used for type-ahead, filtering and the selected value. Needed when `children` is not a string. */
  textValue?: string;
  isDisabled?: boolean;
}

/** One row of a Picker or ComboBox list. The size comes from the surrounding field. */
export function OptionItem({ children, textValue, ...props }: OptionItemProps) {
  const size = useContext(SizeContext) ?? "M";
  const choose = useContext(TrayChoiceContext);
  return (
    <ListBoxItem
      {...props}
      textValue={textValue ?? (typeof children === "string" ? children : undefined)}
      onPress={choose ? () => choose(props.id) : undefined}
      className={listItem({ size })}
    >
      {({ isSelected }) => (
        <>
          <span>{children}</span>
          {isSelected ? <Check aria-hidden="true" className={icon({ size })} /> : null}
        </>
      )}
    </ListBoxItem>
  );
}
