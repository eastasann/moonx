import type { Size, SizeWithXS } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useContext } from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  Toolbar,
} from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import { isIconOnly } from "../internal/iconOnly";
import * as styles from "./ActionButton.css";

interface ActionDefaults {
  isQuiet?: boolean;
  size?: Size;
}

const ActionGroupContext = createContext<ActionDefaults>({});

export interface ActionButtonProps
  extends Pick<
    AriaButtonProps,
    | "onPress"
    | "isDisabled"
    | "autoFocus"
    | "id"
    | "aria-label"
    | "aria-describedby"
    | "aria-expanded"
    | "aria-controls"
    | "aria-haspopup"
  > {
  /** No border and no fill until hovered (toolbars). */
  isQuiet?: boolean;
  /** @default "M" */
  size?: Size;
  /** A Lucide icon, text, or both. An icon alone needs an `aria-label`. */
  children: ReactNode;
}

/** A tool on the screen (the toolbar's 💬・🕘・⋯), as opposed to its main action. */
export function ActionButton(props: ActionButtonProps) {
  return <ActionButtonBase {...props} />;
}

/**
 * ActionButton with the XS step too, for the components whose button starts at XS
 * (ActionMenu, ContextualHelp; design-spec 4.5). Not exported from the package: an
 * ActionButton of its own starts at S.
 */
export function ActionButtonBase({
  isQuiet: ownQuiet,
  size: ownSize,
  children,
  ...props
}: Omit<ActionButtonProps, "size"> &
  Pick<AriaButtonProps, "onFocus" | "onPressStart"> & { size?: SizeWithXS }) {
  const defaults = useContext(ActionGroupContext);
  const size = ownSize ?? defaults.size ?? "M";
  const isQuiet = ownQuiet ?? defaults.isQuiet ?? false;
  return (
    <AriaButton
      {...props}
      className={styles.actionButton({
        isQuiet,
        size,
        iconOnly: isIconOnly(children),
      })}
    >
      <IconSlot size={size}>{children}</IconSlot>
    </AriaButton>
  );
}

export interface ActionGroupProps extends ActionDefaults {
  /** Names the toolbar for screen readers. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  /** `compact` tightens the gap between the buttons. @default "regular" */
  density?: "compact" | "regular";
  children: ReactNode;
}

/**
 * ActionButtons as one toolbar: arrow keys move between them and Tab leaves the group.
 * `isQuiet` and `size` apply to every button that does not set its own.
 */
export function ActionGroup({
  isQuiet,
  size,
  orientation = "horizontal",
  density = "regular",
  children,
  ...props
}: ActionGroupProps) {
  return (
    <Toolbar
      {...props}
      orientation={orientation}
      className={styles.group({ orientation, density })}
    >
      <ActionGroupContext.Provider value={{ isQuiet, size }}>
        {children}
      </ActionGroupContext.Provider>
    </Toolbar>
  );
}
