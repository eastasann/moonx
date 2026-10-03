import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ActionButton } from "../ActionButton";
import { Heading } from "../Heading";
import { Tray } from "../Tray";

export interface PanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Heading and accessible name of the panel, such as "Comments" or "History". */
  title: string;
  /** Accessible name of the close button. */
  closeLabel: string;
  /** Body: the comment threads or the change history. */
  children: ReactNode;
  /** Pinned below the body, such as the comment input. */
  footer?: ReactNode;
}

/**
 * Comment and change-history panel (PNL-1, PNL-2). On the phone it always opens in a `Tray`
 * (design-spec 4.5), modal, with a header (title and close button), the body and the footer.
 * The Web's side and drawer modes do not exist here.
 */
export function Panel({ isOpen, onOpenChange, title, closeLabel, children, footer }: PanelProps) {
  return (
    <Tray
      aria-label={title}
      role="dialog"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      footer={footer}
    >
      <View style={styles.header}>
        <View style={styles.title}>
          <Heading level={2} variant="heading-4">
            {title}
          </Heading>
        </View>
        <ActionButton
          isQuiet
          icon={<X />}
          aria-label={closeLabel}
          onPress={() => onOpenChange(false)}
        />
      </View>
      <View style={styles.body}>{children}</View>
    </Tray>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["100"],
    paddingBottom: theme.space["100"],
  },
  title: { flex: 1, minWidth: 0 },
  body: { gap: theme.density.regular.gap, paddingVertical: theme.space["100"] },
}));
