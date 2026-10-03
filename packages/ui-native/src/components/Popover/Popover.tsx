import type { ReactElement, ReactNode } from "react";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { fontStyle } from "../../internal/typography";
import { ResponsivePopover, type ResponsivePopoverProps } from "../ResponsivePopover";

export interface PopoverProps {
  /** The element that opens the popover. It must take `onPress`, like `Button`. */
  trigger?: ReactElement<{ onPress?: () => void }>;
  /** Accessible name of the popover. */
  "aria-label": string;
  children: ReactNode | ((opts: { close: () => void }) => ReactNode);
  /** Accepted and ignored: on a phone the popover is always a tray with no anchor. */
  placement?: ResponsivePopoverProps["placement"];
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/** A tray on the phone (the Web part is a popover on tablet and wider; design-spec 4.5). */
export function Popover({ children, ...props }: PopoverProps) {
  return (
    <ResponsivePopover {...props}>
      {({ close }) => (
        <Content textStyle={styles.text} iconSize={styles.icon.width}>
          {typeof children === "function" ? children({ close }) : children}
        </Content>
      )}
    </ResponsivePopover>
  );
}

const styles = StyleSheet.create((theme) => ({
  text: { ...fontStyle(theme, "body-sm"), color: theme.color.text.primary },
  icon: { width: theme.scale.component.icon.size.M },
}));
