import type { DialogSize } from "@moonx/ui-tokens";
import { X } from "lucide-react-native";
import { cloneElement, createContext, type ReactElement, type ReactNode, useContext } from "react";
import { Modal, Text as NativeText, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";
import { useReducedMotion } from "../../internal/useReducedMotion";
import { Tray } from "../Tray";

export type CloseRender = { close: () => void };

export interface DialogSurfaceProps {
  trigger?: ReactElement<{ onPress?: () => void }>;
  size: DialogSize;
  /** Names the dialog; also the accessible name of the tray or sheet. */
  "aria-label": string;
  role?: "dialog" | "alertdialog";
  isKeyboardDismissDisabled?: boolean;
  /** Passed to the tray sizes; the full-screen sheet has no outside to press. */
  isDismissable?: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  children: (opts: CloseRender) => ReactNode;
}

/** Whether the body may scroll: only the full-screen sheet has a bounded height. */
const ScrollContext = createContext(false);

/**
 * The overlay shared by Dialog and AlertDialog: a tray for small, medium and large, a
 * full-screen sheet for fullscreen (design-spec 3.8). Not part of the public API.
 */
export function DialogSurface({
  trigger,
  size,
  role = "dialog",
  isKeyboardDismissDisabled,
  isDismissable = true,
  isOpen,
  defaultOpen = false,
  onOpenChange,
  "aria-label": ariaLabel,
  children,
}: DialogSurfaceProps) {
  const [open, setOpen] = useControlledState(isOpen, defaultOpen, onOpenChange);
  const close = () => setOpen(false);
  const body = (
    // The tray names itself and carries the role; only the sheet needs them here.
    <View
      role={size === "fullscreen" ? role : undefined}
      aria-label={size === "fullscreen" ? ariaLabel : undefined}
      aria-modal
      style={styles.dialog}
    >
      {children({ close })}
    </View>
  );

  if (size !== "fullscreen") {
    return (
      <Tray
        trigger={trigger}
        aria-label={ariaLabel}
        isOpen={open}
        onOpenChange={setOpen}
        isDismissable={isDismissable}
        role={role}
      >
        <ScrollContext.Provider value={false}>{body}</ScrollContext.Provider>
      </Tray>
    );
  }
  return (
    <>
      {trigger
        ? cloneElement(trigger, {
            onPress: () => {
              trigger.props.onPress?.();
              setOpen(true);
            },
          })
        : null}
      <FullScreenSheet
        visible={open}
        onRequestClose={isKeyboardDismissDisabled ? undefined : close}
      >
        <ScrollContext.Provider value>{body}</ScrollContext.Provider>
      </FullScreenSheet>
    </>
  );
}

interface FullScreenSheetProps {
  visible: boolean;
  onRequestClose?: () => void;
  children: ReactNode;
}

/** Kept apart from `DialogSurface` so only full-screen dialogs read the motion setting. */
function FullScreenSheet({ visible, onRequestClose, children }: FullScreenSheetProps) {
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? "none" : "slide"}
      presentationStyle="fullScreen"
      onRequestClose={onRequestClose}
    >
      <View style={[styles.sheet, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {children}
      </View>
    </Modal>
  );
}

/** The heading that names a dialog. Not part of the public API. */
export function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <NativeText role="heading" aria-level={2} style={styles.title}>
      {children}
    </NativeText>
  );
}

/** Not part of the public API. */
export function DialogHeader({ children }: { children: ReactNode }) {
  return <View style={styles.header}>{children}</View>;
}

/** Not part of the public API. */
export function DialogBody({ children }: { children: ReactNode }) {
  const scroll = useContext(ScrollContext);
  const content = (
    <Content textStyle={styles.bodyText} iconSize={styles.bodyIcon.width}>
      {children}
    </Content>
  );
  return scroll ? (
    <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body}>
      {content}
    </ScrollView>
  ) : (
    <View style={styles.body}>{content}</View>
  );
}

/** Not part of the public API. */
export function DialogFooter({ children }: { children: ReactNode }) {
  return <View style={styles.footer}>{children}</View>;
}

/** The close button of the header. Not part of the public API. */
export function DialogCloseButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => styles.closeButton(pressed)}
    >
      <X
        aria-hidden
        color={styles.closeIcon.color}
        size={styles.closeIcon.width}
        strokeWidth={styles.closeIcon.strokeWidth}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  sheet: { flex: 1, backgroundColor: theme.color.surface.overlay },
  dialog: { flexShrink: 1, flexGrow: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.space["200"],
    paddingTop: theme.space["100"],
  },
  title: { ...fontStyle(theme, "heading-3"), flex: 1, color: theme.color.text.primary },
  bodyScroll: { flex: 1 },
  body: { paddingVertical: theme.space["200"] },
  bodyText: { ...fontStyle(theme, "body"), color: theme.color.text.primary },
  bodyIcon: { width: theme.scale.component.icon.size.M },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.space["200"],
    paddingTop: theme.space["100"],
  },
  closeButton: (pressed: boolean) => ({
    alignItems: "center",
    justifyContent: "center",
    minWidth: theme.scale.component["target-min"],
    minHeight: theme.scale.component["target-min"],
    padding: theme.scale.component["action-button"]["padding-icon-only"].M,
    borderRadius: theme.radius.control,
    backgroundColor: pressed ? theme.color.surface.sunken : "transparent",
  }),
  closeIcon: {
    width: theme.scale.component.icon.size.M,
    color: theme.color.text.secondary,
    strokeWidth: theme.icon["stroke-width"],
  },
}));
