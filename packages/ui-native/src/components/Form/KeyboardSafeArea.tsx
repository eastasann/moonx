import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, type KeyboardEvent, Platform, ScrollView, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { KeyboardSafeAreaContext } from "../../internal/KeyboardSafeAreaContext";
import { type Measurable, measureInWindow } from "../../internal/measure";

export interface KeyboardSafeAreaProps {
  children: ReactNode;
  /**
   * Content pinned under the scrolling part, such as the save state or a submit bar. It rides
   * above the keyboard, so it is never hidden (design-spec 4.3).
   */
  footer?: ReactNode;
  testID?: string;
}

/**
 * A screen body that keeps inputs and `footer` clear of the keyboard: a scrolling area that
 * shrinks by however much of the keyboard covers it, and scrolls the focused input into the
 * visible part, also when focus moves from one input to the next. Place it where the screen's
 * body would go, with a bounded height (inside a flex parent).
 *
 * It measures the overlap in window coordinates instead of assuming the platform resizes the
 * window, so it works the same whether Android resizes the window or draws under the keyboard,
 * and does not add space twice. The change is not animated. Tapping a button while the keyboard
 * is up works on the first tap (`keyboardShouldPersistTaps="handled"`); dragging the content
 * dismisses the keyboard.
 */
export function KeyboardSafeArea({ children, footer, testID }: KeyboardSafeAreaProps) {
  const { theme } = useUnistyles();
  const margin = theme.space["300"];
  const container = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const [inset, setInset] = useState(0);

  const reveal = useCallback(async () => {
    const top = keyboardTop.current;
    const input = TextInput.State.currentlyFocusedInput() as Measurable | null;
    const view = scroll.current as Measurable | null;
    if (top === null || !input || !view) return;
    const [field, area] = await Promise.all([measureInWindow(input), measureInWindow(view)]);
    const visibleTop = area.y + margin;
    const visibleBottom = Math.min(area.y + area.height, top) - margin;
    const fieldBottom = field.y + field.height;
    if (fieldBottom > visibleBottom) {
      scroll.current?.scrollTo({
        y: scrollY.current + fieldBottom - visibleBottom,
        animated: true,
      });
    } else if (field.y < visibleTop) {
      scroll.current?.scrollTo({
        y: Math.max(0, scrollY.current - (visibleTop - field.y)),
        animated: true,
      });
    }
  }, [margin]);

  useEffect(() => {
    const place = async (event: KeyboardEvent | null) => {
      const top = event ? event.endCoordinates.screenY : null;
      keyboardTop.current = top;
      const box = container.current as Measurable | null;
      if (!box) return;
      if (top === null) {
        setInset(0);
        return;
      }
      const rect = await measureInWindow(box);
      // The keyboard may have hidden while the measurement was in flight; a stale `top` would
      // leave the padding behind with no keyboard on screen.
      if (keyboardTop.current !== top) return;
      setInset(Math.max(0, rect.y + rect.height - top));
      await reveal();
    };
    const [show, hide] =
      Platform.OS === "ios"
        ? (["keyboardWillChangeFrame", "keyboardWillHide"] as const)
        : (["keyboardDidShow", "keyboardDidHide"] as const);
    const subscriptions = [
      Keyboard.addListener(show, (event) => void place(event)),
      Keyboard.addListener(hide, () => void place(null)),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [reveal]);

  const context = useMemo(() => ({ reveal: () => void reveal() }), [reveal]);

  return (
    <KeyboardSafeAreaContext.Provider value={context}>
      <View ref={container} testID={testID} style={styles.container(inset)}>
        <ScrollView
          ref={scroll}
          testID={testID ? `${testID}-scroll` : undefined}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
          }}
          style={styles.scroll}
          contentContainerStyle={styles.content}
        >
          {children}
        </ScrollView>
        {footer}
      </View>
    </KeyboardSafeAreaContext.Provider>
  );
}

const styles = StyleSheet.create(() => ({
  container: (inset: number) => ({ flex: 1, paddingBottom: inset }),
  scroll: { flex: 1 },
  content: { flexGrow: 1 },
}));
