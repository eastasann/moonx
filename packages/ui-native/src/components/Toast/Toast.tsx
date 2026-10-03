import { TOAST_VARIANTS, type ToastVariant } from "@moonx/ui-tokens";
import { Portal } from "@rn-primitives/portal";
import { Bell, CircleAlert, CircleCheck, Info, X } from "lucide-react-native";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform, Pressable, Text, View } from "react-native";
import Animated, { FadeOut, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useHasTabBar } from "../../internal/tabBarPresence";
import { fontStyle } from "../../internal/typography";
import { useReducedMotion } from "../../internal/useReducedMotion";

/** What a toast shows. Put the text from `packages/i18n` here. */
export interface ToastMessage {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

/** Options of `ToastQueue.add`. */
export interface ToastOptions {
  /** Milliseconds before the toast closes by itself. Defaults to `DEFAULT_TOAST_TIMEOUT`. */
  timeout?: number;
  /** Called once when the toast leaves the queue, whether it timed out or was closed. */
  onClose?: () => void;
}

/** A toast waiting in or showing from a queue. */
export interface QueuedToast {
  key: string;
  content: ToastMessage;
  timeout: number;
  onClose?: () => void;
}

/** Milliseconds a toast stays when `add` is called without a `timeout`. Same as the Web part. */
export const DEFAULT_TOAST_TIMEOUT = 5000;

const DEFAULT_MAX_VISIBLE = 4;

/** Same surface as the Web part's queue, so a screen's `queue.add(...)` call is written once. */
export interface ToastQueue {
  /** Adds a toast and returns its key. */
  add: (content: ToastMessage, options?: ToastOptions) => string;
  close: (key: string) => void;
  clear: () => void;
  /** The toasts being shown, newest first. A new array whenever the list changes. */
  readonly visibleToasts: readonly QueuedToast[];
  /** For `useSyncExternalStore`; returns the unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
}

class Queue implements ToastQueue {
  private all: QueuedToast[] = [];
  private shown: readonly QueuedToast[] = [];
  private listeners = new Set<() => void>();
  private counter = 0;

  constructor(private readonly maxVisible: number) {}

  get visibleToasts() {
    return this.shown;
  }

  add = (content: ToastMessage, options: ToastOptions = {}) => {
    const key = `toast-${this.counter++}`;
    this.all = [
      {
        key,
        content,
        timeout: options.timeout ?? DEFAULT_TOAST_TIMEOUT,
        onClose: options.onClose,
      },
      ...this.all,
    ];
    this.publish();
    return key;
  };

  close = (key: string) => {
    const closing = this.all.find((toast) => toast.key === key);
    if (!closing) return;
    this.all = this.all.filter((toast) => toast.key !== key);
    this.publish();
    closing.onClose?.();
  };

  clear = () => {
    const closing = this.all;
    this.all = [];
    this.publish();
    for (const toast of closing) toast.onClose?.();
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish() {
    this.shown = this.all.slice(0, this.maxVisible);
    for (const listener of this.listeners) listener();
  }
}

/**
 * Creates the queue that screens add toasts to (`queue.add({ title, variant })`) and a
 * `ToastRegion` shows. Create one per app, at module level.
 */
export function createToastQueue(options?: { maxVisibleToasts?: number }): ToastQueue {
  return new Queue(options?.maxVisibleToasts ?? DEFAULT_MAX_VISIBLE);
}

export interface ToastRegionProps {
  queue: ToastQueue;
  /** Accessible name of the region, for example "Notifications". */
  label: string;
  /** Accessible name of each toast's close button. */
  closeLabel: string;
}

const ICONS = {
  informative: Info,
  positive: CircleCheck,
  negative: CircleAlert,
  neutral: Bell,
} as const satisfies Record<ToastVariant, unknown>;

/**
 * Shows the toasts of a queue at the bottom of the screen, above the tab bar. Mount it once, near
 * the root, below `UiProvider`: it draws into the provider's portal host so it floats over every
 * screen. A touch on a toast holds its timer until the finger lifts. Toasts of `negative` are
 * announced at once (`alert`); the others wait for a pause (`status`).
 */
export function ToastRegion({ queue, label, closeLabel }: ToastRegionProps) {
  const toasts = useSyncExternalStore(
    queue.subscribe,
    () => queue.visibleToasts,
    () => queue.visibleToasts,
  );
  const name = useId();
  if (toasts.length === 0) return null;
  return (
    <Portal name={`toast-region-${name}`}>
      <Region label={label}>
        {/* Newest nearest the bottom edge, where the thumb is. */}
        {[...toasts].reverse().map((toast) => (
          <ToastItem key={toast.key} toast={toast} queue={queue} closeLabel={closeLabel} />
        ))}
      </Region>
    </Portal>
  );
}

function Region({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  // The tab bar sits under the body, outside this host, so its height is added by hand.
  const hasTabBar = useHasTabBar();
  const bottom =
    (hasTabBar ? theme.layout["tab-bar-height"] : 0) + insets.bottom + theme.space["200"];
  return (
    <View
      role="group"
      aria-label={label}
      pointerEvents="box-none"
      style={[styles.region, { bottom }]}
    >
      {children}
    </View>
  );
}

function ToastItem({
  toast,
  queue,
  closeLabel,
}: {
  toast: QueuedToast;
  queue: ToastQueue;
  closeLabel: string;
}) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const variant = toast.content.variant ?? "neutral";
  styles.useVariants({ variant });
  const Icon = ICONS[variant];
  const color = theme.color[variant]["on-strong"];
  const [held, setHeld] = useState(false);
  const remaining = useRef(toast.timeout);

  // A held toast keeps the time it has left, so a touch cannot shorten or reset its stay.
  useEffect(() => {
    if (held) return;
    const startedAt = Date.now();
    const id = setTimeout(() => queue.close(toast.key), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current -= Date.now() - startedAt;
    };
  }, [held, queue, toast.key]);

  // iOS has no live regions, so VoiceOver is told directly; Android reads the live region below.
  const { title, description } = toast.content;
  useEffect(() => {
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(description ? `${title}. ${description}` : title);
    }
  }, [title, description]);

  const urgent = variant === "negative";
  return (
    <Animated.View
      entering={reduced ? undefined : SlideInDown.duration(theme.motion.transition.enter.duration)}
      exiting={reduced ? undefined : FadeOut.duration(theme.motion.transition.exit.duration)}
      testID="toast"
      role={urgent ? "alert" : "status"}
      accessibilityLiveRegion={urgent ? "assertive" : "polite"}
      onTouchStart={() => setHeld(true)}
      onTouchEnd={() => setHeld(false)}
      onTouchCancel={() => setHeld(false)}
      style={styles.toast}
    >
      <View aria-hidden>
        <Icon
          size={theme.scale.component.icon.size.M}
          color={color}
          strokeWidth={theme.icon["stroke-width"]}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{toast.content.title}</Text>
        {toast.content.description ? (
          <Text style={styles.description}>{toast.content.description}</Text>
        ) : null}
      </View>
      <Pressable
        role="button"
        aria-label={closeLabel}
        onPress={() => queue.close(toast.key)}
        style={({ pressed }) => styles.close(pressed)}
      >
        <X
          size={theme.scale.component.icon.size.M}
          color={color}
          strokeWidth={theme.icon["stroke-width"]}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => {
  const targetMin = theme.scale.component["target-min"];
  const byVariant = <T,>(build: (v: ToastVariant) => T) =>
    Object.fromEntries(TOAST_VARIANTS.map((v) => [v, build(v)])) as Record<ToastVariant, T>;
  return {
    region: {
      position: "absolute",
      left: 0,
      right: 0,
      zIndex: theme.layout["z-index"].toast,
      alignItems: "center",
      gap: theme.space["100"],
      paddingHorizontal: theme.layout["page-gutter-mobile"],
    },
    toast: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space["200"],
      width: "100%",
      maxWidth: theme.layout["dialog-max-width"].L,
      minHeight: theme.scale.component.toast["min-height"],
      paddingVertical: theme.space["100"],
      paddingLeft: theme.space["200"],
      borderRadius: theme.radius.card,
      boxShadow: [
        {
          offsetX: theme.shadow.overlay.offsetX,
          offsetY: theme.shadow.overlay.offsetY,
          blurRadius: theme.shadow.overlay.blur,
          spreadDistance: theme.shadow.overlay.spread,
          color: theme.shadow.overlay.color,
        },
      ],
      variants: {
        variant: byVariant((v) => ({ backgroundColor: theme.color[v].strong })),
      },
    },
    content: { flex: 1, minWidth: 0 },
    title: {
      ...fontStyle(theme, "label"),
      variants: { variant: byVariant((v) => ({ color: theme.color[v]["on-strong"] })) },
    },
    description: {
      ...fontStyle(theme, "body-sm"),
      variants: { variant: byVariant((v) => ({ color: theme.color[v]["on-strong"] })) },
    },
    close: (pressed: boolean) => ({
      alignItems: "center",
      justifyContent: "center",
      minWidth: targetMin,
      minHeight: targetMin,
      borderRadius: theme.radius.control,
      borderWidth: pressed ? theme["border-width"]["focus-ring"] : 0,
      borderColor: "transparent",
      variants: {
        variant: byVariant((v) => ({
          borderColor: pressed ? theme.color[v]["on-strong"] : "transparent",
        })),
      },
    }),
  };
});
