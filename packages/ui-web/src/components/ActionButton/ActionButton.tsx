import type { ComponentSize } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { actionButton, iconSlot } from "./ActionButton.css";

type AriaProps = Omit<AriaButtonProps, "className" | "style" | "children">;

interface ActionButtonBase extends AriaProps {
  size?: ComponentSize;
  /** Drops the filled background; for toolbars where the buttons should recede. */
  isQuiet?: boolean;
}

/** A text button, optionally with an icon before the text. */
interface ActionButtonWithText extends ActionButtonBase {
  children: ReactNode;
  icon?: ReactNode;
}

/** An icon alone. The accessible name is required because nothing else names the button. */
interface ActionButtonIconOnly extends ActionButtonBase {
  icon: ReactNode;
  children?: undefined;
  "aria-label": string;
}

export type ActionButtonProps = ActionButtonWithText | ActionButtonIconOnly;

/** Icon plus text of an action button; the group item reuses it. */
export function ActionButtonContent({
  icon,
  children,
  size,
}: {
  icon?: ReactNode;
  children?: ReactNode;
  size: ComponentSize;
}) {
  return (
    <>
      {icon ? (
        <span aria-hidden="true" className={iconSlot({ size })}>
          {icon}
        </span>
      ) : null}
      {children}
    </>
  );
}

export function ActionButton({
  size = "M",
  isQuiet = false,
  icon,
  children,
  ...props
}: ActionButtonProps) {
  const iconOnly = children === undefined || children === null;
  return (
    <AriaButton {...props} className={actionButton({ size, quiet: isQuiet, iconOnly })}>
      <ActionButtonContent icon={icon} size={size}>
        {children}
      </ActionButtonContent>
    </AriaButton>
  );
}
