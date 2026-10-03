import { Portal } from "@rn-primitives/portal";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";

/** Milliseconds a finger stays down before the tooltip opens, when `delay` is not given. */
export const DEFAULT_LONG_PRESS_DELAY = 500;
/** Milliseconds the tooltip stays after the finger lifts, when `closeDelay` is not given. */
export const DEFAULT_CLOSE_DELAY = 1500;

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  /** The element the tooltip describes, such as a `Button`. */
  children: ReactNode;
  /** The text shown. Keep it to a short phrase; anything longer belongs in ContextualHelp. */
  content: ReactNode;
  /** Where it sits against the element. It moves to the opposite side when there is no room. */
  placement?: TooltipPlacement;
  /**
   * Milliseconds the finger must stay down before it opens. The Web part opens on hover after a
   * delay; touch has no hover, so the trigger is a long press and the default is shorter.
   */
  delay?: number;
  /** Milliseconds it stays after the finger lifts, so it can be read. */
  closeDelay?: number;
  isDisabled?: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  testID?: string;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;

/** Top-left of the tooltip on `side` of `anchor`, in the same coordinates as the anchor. */
function origin(side: TooltipPlacement, anchor: Box, tip: Box, gap: number) {
  switch (side) {
    case "top":
      return { x: anchor.x + (anchor.width - tip.width) / 2, y: anchor.y - tip.height - gap };
    case "bottom":
      return { x: anchor.x + (anchor.width - tip.width) / 2, y: anchor.y + anchor.height + gap };
    case "left":
      return { x: anchor.x - tip.width - gap, y: anchor.y + (anchor.height - tip.height) / 2 };
    case "right":
      return { x: anchor.x + anchor.width + gap, y: anchor.y + (anchor.height - tip.height) / 2 };
  }
}

const fits = (at: { x: number; y: number }, tip: Box, bounds: Box, margin: number) =>
  at.x >= margin &&
  at.y >= margin &&
  at.x + tip.width <= bounds.width - margin &&
  at.y + tip.height <= bounds.height - margin;

/**
 * Describes an icon-only button. The Web twin opens on hover and keyboard focus; a phone has
 * neither, so this opens on a long press of the child and closes `closeDelay` after the finger
 * lifts. `@rn-primitives/tooltip` is not used: it toggles on a plain press, which would swallow
 * the child's own `onPress`. Long press is a gesture-handler recognizer around the child, so a
 * short tap still reaches the child and a long press does not also trigger it.
 *
 * A screen reader user gets the same text from the child's accessible name (the Web part has
 * the same rule), and the tooltip announces itself when it opens for the sighted long-presser.
 * The tooltip draws into the portal host of `UiProvider`.
 */
export function Tooltip({
  children,
  content,
  placement = "top",
  delay = DEFAULT_LONG_PRESS_DELAY,
  closeDelay = DEFAULT_CLOSE_DELAY,
  isDisabled = false,
  isOpen,
  defaultOpen = false,
  onOpenChange,
  testID,
}: TooltipProps) {
  const { theme } = useUnistyles();
  const name = useId();
  const [open, setOpen] = useControlledState(isOpen, defaultOpen, onOpenChange);
  const visible = open && !isDisabled;
  const anchorRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Box | null>(null);
  const [bounds, setBounds] = useState<Box | null>(null);
  const [tip, setTip] = useState<Box | null>(null);

  const latest = useRef({ setOpen, closeDelay });
  latest.current = { setOpen, closeDelay };
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByPress = useRef(false);
  const clearTimer = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    if (!visible) return;
    anchorRef.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  }, [visible]);

  const longPress = Gesture.LongPress()
    .withTestId(`tooltip-long-press-${name}`)
    .enabled(!isDisabled)
    .minDuration(delay)
    .runOnJS(true)
    .onStart(() => {
      clearTimer();
      openedByPress.current = true;
      latest.current.setOpen(true);
    })
    .onFinalize(() => {
      if (!openedByPress.current) return;
      openedByPress.current = false;
      clearTimer();
      closeTimer.current = setTimeout(
        () => latest.current.setOpen(false),
        latest.current.closeDelay,
      );
    });

  // The layer is as large as the host, but the host may start below the status bar, so its own
  // window offset is taken off the trigger's window position.
  const layerRef = useRef<View>(null);
  const [layerOffset, setLayerOffset] = useState({ x: 0, y: 0 });
  const onLayerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBounds({ x: 0, y: 0, width, height });
    layerRef.current?.measureInWindow((x, y) => setLayerOffset({ x, y }));
  };

  const margin = theme.space["100"];
  const gap = theme.space["75"];
  let position: { left: number; top: number } | null = null;
  if (anchor && bounds && tip) {
    const local = { ...anchor, x: anchor.x - layerOffset.x, y: anchor.y - layerOffset.y };
    const preferred = origin(placement, local, tip, gap);
    const flipped = origin(OPPOSITE[placement], local, tip, gap);
    const at =
      fits(preferred, tip, bounds, margin) || !fits(flipped, tip, bounds, margin)
        ? preferred
        : flipped;
    position = {
      left: Math.min(Math.max(at.x, margin), Math.max(margin, bounds.width - tip.width - margin)),
      top: Math.min(Math.max(at.y, margin), Math.max(margin, bounds.height - tip.height - margin)),
    };
  }

  return (
    <>
      <GestureDetector gesture={longPress}>
        <View ref={anchorRef} collapsable={false} testID={testID}>
          {children}
        </View>
      </GestureDetector>
      {visible ? (
        <Portal name={`tooltip-${name}`}>
          <View ref={layerRef} pointerEvents="none" onLayout={onLayerLayout} style={styles.layer}>
            <View
              accessible
              role="tooltip"
              accessibilityLiveRegion="polite"
              onLayout={(event) => {
                const { x, y, width, height } = event.nativeEvent.layout;
                setTip({ x, y, width, height });
              }}
              style={[
                styles.tooltip,
                bounds
                  ? { maxWidth: Math.min(styles.tooltip.maxWidth, bounds.width - 2 * margin) }
                  : null,
                position ?? styles.unplaced,
              ]}
            >
              <Content textStyle={styles.text} iconSize={styles.icon.width}>
                {content}
              </Content>
            </View>
          </View>
        </Portal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: theme.layout["z-index"].overlay },
  tooltip: {
    position: "absolute",
    maxWidth: theme.layout["dialog-max-width"].S,
    paddingVertical: theme.space["75"],
    paddingHorizontal: theme.space["100"],
    borderRadius: theme.radius.control,
    backgroundColor: theme.color.control.primary,
  },
  // Measured before it is placed, so it must not flash at the corner.
  unplaced: { left: 0, top: 0, opacity: 0 },
  text: { ...fontStyle(theme, "caption"), color: theme.color.control["on-primary"] },
  icon: { width: theme.scale.component.icon.size.S },
}));
