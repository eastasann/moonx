import * as Collapsible from "@rn-primitives/collapsible";
import { ChevronRight } from "lucide-react-native";
import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import { View } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { atLeastTarget } from "../../internal/sizes";
import { timingConfig } from "../../internal/timing";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";
import { useReducedMotion } from "../../internal/useReducedMotion";

/** Identifies a `Disclosure` inside an `Accordion`. */
type Key = string | number;

interface GroupContext {
  expanded: ReadonlySet<Key>;
  isDisabled: boolean;
  setExpanded: (id: Key, next: boolean) => void;
}

const AccordionContext = createContext<GroupContext | null>(null);

export interface DisclosureProps {
  /** Required inside an `Accordion`, where it identifies the item. */
  id?: Key;
  /** Required. The content of the toggle, which is the disclosure's accessible name. */
  title: ReactNode;
  children: ReactNode;
  /** Level of the heading that wraps the toggle. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  isExpanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (isExpanded: boolean) => void;
  isDisabled?: boolean;
  testID?: string;
}

/**
 * A section that opens and closes. The panel is mounted only while open. The chevron turns and
 * the panel fades in over `semantic.motion.transition.expand`, or at once when the OS asks for
 * reduced motion; the Web part animates the panel's height, which a phone does not need.
 */
export function Disclosure({
  id,
  title,
  children,
  headingLevel = 3,
  isExpanded,
  defaultExpanded = false,
  onExpandedChange,
  isDisabled = false,
  testID,
}: DisclosureProps) {
  const group = useContext(AccordionContext);
  const inGroup = group !== null && id !== undefined;
  const [own, setOwn] = useControlledState(isExpanded, defaultExpanded, onExpandedChange);
  const expanded = inGroup ? group.expanded.has(id) : own;
  const disabled = isDisabled || (inGroup && group.isDisabled);
  const setExpanded = (next: boolean) => {
    if (inGroup) {
      group.setExpanded(id, next);
      onExpandedChange?.(next);
    } else {
      setOwn(next);
    }
  };

  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  styles.useVariants({ disabled });
  const turn = useSharedValue(expanded ? 1 : 0);
  const motion = theme.motion.transition.expand;
  useEffect(() => {
    const target = expanded ? 1 : 0;
    turn.value = reduced ? target : withTiming(target, timingConfig(motion));
  }, [expanded, reduced, motion, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 90}deg` }] }));

  return (
    <Collapsible.Root
      open={expanded}
      onOpenChange={setExpanded}
      disabled={disabled}
      testID={testID}
      style={styles.disclosure}
    >
      <View role="heading" aria-level={headingLevel}>
        <Collapsible.Trigger style={({ pressed }) => styles.trigger(pressed)}>
          <Animated.View aria-hidden style={chevron}>
            <ChevronRight
              size={theme.scale.component.icon.size.S}
              color={styles.title.color}
              strokeWidth={theme.icon["stroke-width"]}
            />
          </Animated.View>
          <View style={styles.titleBox}>
            <Content textStyle={styles.title} iconSize={styles.icon.width}>
              {title}
            </Content>
          </View>
        </Collapsible.Trigger>
      </View>
      <Collapsible.Content>
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(motion.duration)}
          style={styles.panel}
        >
          <Content textStyle={styles.panelText} iconSize={styles.icon.width}>
            {children}
          </Content>
        </Animated.View>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export interface AccordionProps {
  /** `Disclosure` items, each with an `id`. */
  children: ReactNode;
  /** Whether several items may be open. Off by default: opening one closes the others. */
  allowsMultipleExpanded?: boolean;
  isDisabled?: boolean;
  expandedKeys?: Iterable<Key>;
  defaultExpandedKeys?: Iterable<Key>;
  onExpandedChange?: (keys: Set<Key>) => void;
  testID?: string;
}

/** A stack of `Disclosure` items. One item is open at a time unless `allowsMultipleExpanded`. */
export function Accordion({
  children,
  allowsMultipleExpanded = false,
  isDisabled = false,
  expandedKeys,
  defaultExpandedKeys,
  onExpandedChange,
  testID,
}: AccordionProps) {
  const [expanded, setKeys] = useControlledState<ReadonlySet<Key>>(
    expandedKeys === undefined ? undefined : new Set(expandedKeys),
    new Set(defaultExpandedKeys),
    onExpandedChange as ((keys: ReadonlySet<Key>) => void) | undefined,
  );
  const context = useMemo<GroupContext>(
    () => ({
      expanded,
      isDisabled,
      setExpanded: (id, next) => {
        const keys = new Set(allowsMultipleExpanded ? expanded : []);
        if (next) keys.add(id);
        else keys.delete(id);
        setKeys(keys);
      },
    }),
    [expanded, isDisabled, allowsMultipleExpanded, setKeys],
  );
  return (
    <AccordionContext.Provider value={context}>
      <View testID={testID} style={styles.accordion}>
        {children}
      </View>
    </AccordionContext.Provider>
  );
}

const styles = StyleSheet.create((theme) => ({
  accordion: {
    borderTopWidth: theme["border-width"].hairline,
    borderTopColor: theme.color.border.hairline,
  },
  disclosure: {
    borderBottomWidth: theme["border-width"].hairline,
    borderBottomColor: theme.color.border.hairline,
  },
  trigger: (pressed: boolean) => ({
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["100"],
    minHeight: atLeastTarget(
      theme.scale.component.field.height.L,
      theme.scale.component["target-min"],
    ),
    paddingVertical: theme.space["100"],
    backgroundColor: pressed ? theme.color.surface.hover : "transparent",
  }),
  titleBox: { flex: 1, minWidth: 0 },
  title: {
    ...fontStyle(theme, "label"),
    color: theme.color.text.primary,
    variants: { disabled: { true: { color: theme.color.text.disabled }, false: {} } },
  },
  panel: { paddingBottom: theme.space["200"] },
  panelText: { ...fontStyle(theme, "body-sm"), color: theme.color.text.primary },
  icon: { width: theme.scale.component.icon.size.S },
}));
