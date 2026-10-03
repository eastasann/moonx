import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { BackHandler, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useControlledState } from "../../internal/useControlledState";

export interface TrayProps {
  /** The element that opens the tray. It must take `onPress`, like `Button`. */
  trigger?: ReactElement<{ onPress?: () => void }>;
  /** Accessible name of the tray. */
  "aria-label": string;
  children: ReactNode | ((opts: { close: () => void }) => ReactNode);
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /**
   * Whether a swipe down, a tap on the backdrop or the Android back button closes the tray.
   * Turn it off for content that has to be answered, such as an `AlertDialog`.
   */
  isDismissable?: boolean;
  /**
   * Pinned to the bottom edge, outside the scrolling content: a comment input, the actions of a
   * dialog. It rises with the keyboard.
   */
  footer?: ReactNode;
  /** Role of the tray's content; `dialog` and `alertdialog` for the Dialog parts. */
  role?: "dialog" | "alertdialog";
}

/**
 * A bottom sheet. Menu, Picker, ComboBox, DatePicker, Dialog and the other overlays that are
 * trays below `semantic.breakpoint.tablet` are built on it (design-spec 4.5). Needs `UiProvider`
 * above it in the tree.
 */
export function Tray({
  trigger,
  children,
  "aria-label": ariaLabel,
  isOpen,
  defaultOpen = false,
  onOpenChange,
  isDismissable = true,
  footer,
  role,
}: TrayProps) {
  const { theme } = useUnistyles();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useControlledState(isOpen, defaultOpen, onOpenChange);
  const sheet = useRef<BottomSheetModal>(null);
  const [dismissals, setDismissals] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `dismissals` only re-runs the sync
  useEffect(() => {
    if (open) sheet.current?.present();
    else sheet.current?.dismiss();
  }, [open, dismissals]);

  // The Android back button closes an open tray, or does nothing when the tray must be answered.
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isDismissable) setOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [open, isDismissable, setOpen]);

  const close = useCallback(() => setOpen(false), [setOpen]);
  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior={isDismissable ? "close" : "none"}
      />
    ),
    [isDismissable],
  );

  const footerComponent = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={insets.bottom}>
        <View
          style={styles.footer}
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        >
          {footer}
        </View>
      </BottomSheetFooter>
    ),
    [footer, insets.bottom],
  );

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
      <BottomSheetModal
        ref={sheet}
        enablePanDownToClose={isDismissable}
        enableHandlePanningGesture={isDismissable}
        enableContentPanningGesture={isDismissable}
        // Dragging or tapping the backdrop closes the sheet outside React's state: report it. The
        // count re-runs the effect, so a controlled `isOpen` that stays true presents it again.
        onDismiss={() => {
          if (open) setOpen(false);
          setDismissals((count) => count + 1);
        }}
        backdropComponent={backdrop}
        footerComponent={footer ? footerComponent : undefined}
        maxDynamicContentSize={height * theme.layout["sheet-max-height-ratio"]}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetScrollView keyboardShouldPersistTaps="handled">
          <View
            accessibilityViewIsModal
            role={role}
            accessibilityLabel={ariaLabel}
            style={[
              styles.content,
              { paddingBottom: insets.bottom + theme.space["300"] + footerHeight },
            ]}
          >
            {typeof children === "function" ? children({ close }) : children}
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  background: {
    backgroundColor: theme.color.surface.overlay,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
  },
  footer: {
    paddingHorizontal: theme.layout["page-gutter-mobile"],
    paddingTop: theme.space["200"],
    backgroundColor: theme.color.surface.overlay,
    borderTopWidth: theme["border-width"].hairline,
    borderTopColor: theme.color.border.hairline,
  },
  handle: { backgroundColor: theme.color.border.strong },
  content: {
    paddingHorizontal: theme.layout["page-gutter-mobile"],
    paddingTop: theme.space["100"],
  },
}));
