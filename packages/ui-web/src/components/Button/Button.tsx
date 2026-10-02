import type { ButtonVariant, ComponentSize } from "@moonx/ui-tokens";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { ProgressCircle } from "../ProgressCircle";
import { button } from "./Button.css";

interface ButtonBaseProps extends Omit<AriaButtonProps, "className" | "style" | "isPending"> {
  /** `accent` is for the one main action of a screen. `negative` is only for confirming a deletion. */
  variant?: ButtonVariant;
  size?: ComponentSize;
}

interface IdleProps {
  isPending?: false;
  pendingLabel?: string;
}

interface PendingProps {
  /**
   * Shows a spinner before the label and turns presses off (the button gets `aria-disabled`)
   * while a submit is in flight (design-spec 6.0.6).
   */
  isPending: true;
  /** Accessible name of the spinner, such as "Saving". Required while `isPending`. */
  pendingLabel: string;
}

export type ButtonProps = ButtonBaseProps & (IdleProps | PendingProps);

export function Button({
  variant = "primary",
  size = "M",
  isPending = false,
  pendingLabel,
  children,
  ...props
}: ButtonProps) {
  return (
    <AriaButton {...props} isPending={isPending} className={button({ variant, size })}>
      {(renderProps) => (
        <>
          {isPending ? (
            <ProgressCircle size="S" isIndeterminate aria-label={pendingLabel ?? ""} />
          ) : null}
          {typeof children === "function" ? children(renderProps) : children}
        </>
      )}
    </AriaButton>
  );
}
