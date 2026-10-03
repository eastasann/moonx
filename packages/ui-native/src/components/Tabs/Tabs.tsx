import type { ComponentSize } from "@moonx/ui-tokens";
import {
  Children,
  createContext,
  isValidElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { atLeastTarget, sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";
import { useReducedMotion } from "../../internal/useReducedMotion";

/** Identifies a `Tab` and its `TabPanel`. */
type Key = string | number;

interface TabsState {
  size: ComponentSize;
  selectedKey: Key | undefined;
  select: (key: Key) => void;
  isDisabled: boolean;
  disabledKeys: ReadonlySet<Key>;
  setFirstKey: (key: Key | undefined) => void;
}

const TabsContext = createContext<TabsState | null>(null);

function useTabs(): TabsState {
  const state = useContext(TabsContext);
  if (!state) throw new Error("Tab, TabList and TabPanel must be inside Tabs");
  return state;
}

/** Reports a tab's place in the scrolling list so the list can bring the selected one into view. */
const TabLayoutContext = createContext<(key: Key, x: number, width: number) => void>(() => {});

export interface TabsProps {
  size?: ComponentSize;
  selectedKey?: Key;
  /** Defaults to the first tab that is not disabled. */
  defaultSelectedKey?: Key;
  onSelectionChange?: (key: Key) => void;
  isDisabled?: boolean;
  disabledKeys?: Iterable<Key>;
  children: ReactNode;
  testID?: string;
}

/**
 * Horizontal tabs: `<Tabs><TabList aria-label=…><Tab id=…/></TabList><TabPanel id=…/></Tabs>`.
 * Same compound API as the Web part. Web props with no phone meaning: `keyboardActivation`
 * (there is no arrow-key focus on a phone). The headless `@rn-primitives/tabs` is not used
 * because it needs every value declared up front, while this API picks the first enabled tab by
 * itself and scrolls the list.
 */
export function Tabs({
  size = "M",
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  isDisabled = false,
  disabledKeys,
  children,
  testID,
}: TabsProps) {
  const [chosen, select] = useControlledState<Key | undefined>(
    selectedKey,
    defaultSelectedKey,
    onSelectionChange as ((key: Key | undefined) => void) | undefined,
  );
  const [firstKey, setFirstKey] = useState<Key | undefined>(undefined);
  const disabled = useMemo(() => new Set(disabledKeys), [disabledKeys]);
  const state = useMemo<TabsState>(
    () => ({
      size,
      selectedKey: chosen ?? firstKey,
      select: (key) => {
        if (key !== (chosen ?? firstKey)) select(key);
      },
      isDisabled,
      disabledKeys: disabled,
      setFirstKey,
    }),
    [size, chosen, firstKey, select, isDisabled, disabled],
  );
  return (
    <TabsContext.Provider value={state}>
      <View testID={testID} style={styles.tabs}>
        {children}
      </View>
    </TabsContext.Provider>
  );
}

export interface TabListProps {
  /** Required: the name of the set of tabs. */
  "aria-label": string;
  /** `Tab` items. */
  children: ReactNode;
  testID?: string;
}

/**
 * The row of tabs. It scrolls sideways when the tabs do not fit and keeps the selected tab in
 * view, centered when there is room to.
 */
export function TabList({ "aria-label": ariaLabel, children, testID }: TabListProps) {
  const tabs = useTabs();
  const reduced = useReducedMotion();
  const scroll = useRef<ScrollView>(null);
  const viewport = useRef(0);
  const layouts = useRef(new Map<Key, { x: number; width: number }>());
  const { selectedKey, setFirstKey, isDisabled, disabledKeys } = tabs;

  const tabElements = Children.toArray(children).filter(isValidElement) as {
    props: { id: Key; isDisabled?: boolean };
  }[];
  const first = isDisabled
    ? undefined
    : tabElements.find((tab) => !tab.props.isDisabled && !disabledKeys.has(tab.props.id))?.props.id;
  useLayoutEffect(() => setFirstKey(first), [first, setFirstKey]);

  const reveal = useCallback(() => {
    if (selectedKey === undefined) return;
    const box = layouts.current.get(selectedKey);
    if (!box) return;
    const centered = box.x - (viewport.current - box.width) / 2;
    scroll.current?.scrollTo({ x: Math.max(0, centered), animated: !reduced });
  }, [selectedKey, reduced]);
  useEffect(reveal, [reveal]);

  const onTabLayout = useCallback(
    (key: Key, x: number, width: number) => {
      layouts.current.set(key, { x, width });
      if (key === selectedKey) reveal();
    },
    [selectedKey, reveal],
  );

  return (
    <TabLayoutContext.Provider value={onTabLayout}>
      <ScrollView
        ref={scroll}
        horizontal
        role="tablist"
        aria-label={ariaLabel}
        testID={testID}
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => {
          viewport.current = event.nativeEvent.layout.width;
          reveal();
        }}
        style={styles.tabList}
        contentContainerStyle={styles.tabListContent}
      >
        {children}
      </ScrollView>
    </TabLayoutContext.Provider>
  );
}

export interface TabProps {
  /** Identifies the tab and the `TabPanel` it shows. */
  id: Key;
  isDisabled?: boolean;
  children: ReactNode;
  testID?: string;
}

/** One tab. At least a touch target tall; the selected one has an underline as well as a darker label. */
export function Tab({ id, isDisabled = false, children, testID }: TabProps) {
  const tabs = useTabs();
  const onLayout = useContext(TabLayoutContext);
  const selected = tabs.selectedKey === id;
  const disabled = isDisabled || tabs.isDisabled || tabs.disabledKeys.has(id);
  styles.useVariants({ size: tabs.size, selected, disabled });
  return (
    <Pressable
      role="tab"
      aria-selected={selected}
      aria-disabled={disabled}
      disabled={disabled}
      testID={testID}
      onPress={() => tabs.select(id)}
      onLayout={(event) => onLayout(id, event.nativeEvent.layout.x, event.nativeEvent.layout.width)}
      style={({ pressed }) => styles.tab(pressed)}
    >
      <Content textStyle={styles.label} iconSize={styles.icon.width}>
        {children}
      </Content>
    </Pressable>
  );
}

export interface TabPanelProps {
  /** The `id` of the `Tab` that shows this panel. */
  id: Key;
  /**
   * Keeps the panel mounted while its tab is not selected (hidden from view and from assistive
   * technology), so its state and scroll position survive a switch. Off by default.
   */
  shouldForceMount?: boolean;
  children: ReactNode;
  testID?: string;
}

/**
 * The content of a tab. Only the selected panel is mounted unless `shouldForceMount`. React
 * Native has neither a `tabpanel` role nor `aria-labelledby`, so the panel is a plain group of
 * content with no name of its own.
 */
export function TabPanel({ id, shouldForceMount = false, children, testID }: TabPanelProps) {
  const selected = useTabs().selectedKey === id;
  if (!selected && !shouldForceMount) return null;
  return (
    <View
      aria-hidden={!selected}
      testID={testID}
      style={[styles.panel, selected ? null : styles.hidden]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const targetMin = theme.scale.component["target-min"];
  return {
    tabs: { minWidth: 0 },
    tabList: {
      flexGrow: 0,
      borderBottomWidth: theme["border-width"].hairline,
      borderBottomColor: theme.color.border.hairline,
    },
    tabListContent: { flexGrow: 0 },
    tab: (pressed: boolean) => ({
      flexShrink: 0,
      minWidth: targetMin,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.space["300"],
      borderBottomWidth: theme["border-width"].divider.M,
      borderBottomColor: "transparent",
      backgroundColor: pressed ? theme.color.surface.hover : "transparent",
      variants: {
        size: sizeVariants((s) => ({
          minHeight: atLeastTarget(theme.scale.component.tabs["item-height"][s], targetMin),
        })),
        selected: { true: { borderBottomColor: theme.color.control["track-fill"] }, false: {} },
        disabled: { true: {}, false: {} },
      },
    }),
    label: {
      ...fontStyle(theme, "label"),
      color: theme.color.text.secondary,
      variants: {
        selected: { true: { color: theme.color.text.primary }, false: {} },
        disabled: { true: { color: theme.color.text.disabled }, false: {} },
      },
    },
    icon: { width: theme.scale.component.icon.size.S },
    panel: { paddingTop: theme.space["300"] },
    hidden: { display: "none" },
  };
});
