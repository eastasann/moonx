import type { ComponentSize } from "@moonx/ui-tokens";
import { Ellipsis } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Menu, type MenuProps } from "../Menu";
import { icon, trigger } from "./ActionMenu.css";

export interface ActionMenuProps<T extends object> extends Omit<MenuProps<T>, "trigger"> {
  /** Accessible name of the "⋯" button (and so of the menu), for example "More actions". */
  label: string;
  size?: ComponentSize;
  isDisabled?: boolean;
}

/** A quiet icon-only "⋯" button that opens a `Menu` (row actions, an idea's actions). */
export function ActionMenu<T extends object>({
  label,
  size = "M",
  isDisabled,
  ...props
}: ActionMenuProps<T>) {
  return (
    <Menu
      {...props}
      trigger={
        <AriaButton aria-label={label} isDisabled={isDisabled} className={trigger({ size })}>
          <Ellipsis aria-hidden className={icon({ size })} />
        </AriaButton>
      }
    />
  );
}
