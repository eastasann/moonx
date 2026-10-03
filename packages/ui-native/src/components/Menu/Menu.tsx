import { Check } from "lucide-react-native";
import {
  createContext,
  Fragment,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import { Text as NativeText, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { atLeastTarget } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";
import type { ResponsivePopoverProps } from "../ResponsivePopover";
import { Tray } from "../Tray";

type Key = string | number;
type SelectionMode = "none" | "single" | "multiple";

interface MenuState {
  selectionMode: SelectionMode;
  selectedKeys: ReadonlySet<Key>;
  disabledKeys: ReadonlySet<Key>;
  /** Runs the menu-level action and selection change, and closes the tray when the menu says so. */
  activate: (id: Key) => void;
}

const MenuContext = createContext<MenuState>({
  selectionMode: "none",
  selectedKeys: new Set(),
  disabledKeys: new Set(),
  activate: () => {},
});

export interface MenuProps<T extends object> {
  /**
   * The element that opens the menu. It must take `onPress`, like `Button`; the tray takes its
   * accessible name from the trigger's `aria-label`, or from its text when that is a string.
   */
  trigger: ReactElement<{ onPress?: () => void }>;
  /** Items are `MenuItem`, `MenuSection` and `MenuSeparator`, or a function of `items`. */
  children: ReactNode | ((item: T) => ReactNode);
  /** With a function as `children`; each item needs an `id`, which becomes the React key. */
  items?: Iterable<T>;
  /** Called with the `id` of the pressed item, after the item's own `onAction`. */
  onAction?: (key: Key) => void;
  /** `multiple` keeps the menu open after a press; the others close it. */
  selectionMode?: SelectionMode;
  selectedKeys?: Iterable<Key>;
  defaultSelectedKeys?: Iterable<Key>;
  onSelectionChange?: (keys: Set<Key>) => void;
  disabledKeys?: Iterable<Key>;
  /** Accepted and ignored: on a phone the menu is always a tray with no anchor. */
  placement?: ResponsivePopoverProps["placement"];
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

function triggerName(trigger: ReactElement<Record<string, unknown>>): string {
  const label = trigger.props["aria-label"];
  if (typeof label === "string") return label;
  const text = trigger.props.children;
  return typeof text === "string" ? text : "";
}

/**
 * A menu in a tray (design-spec 4.5; the Web part is a popover on tablet and wider). Items are
 * `MenuItem`, optionally grouped with `MenuSection` and `MenuSeparator`. The React Aria
 * keyboard and collection props (`autoFocus`, `shouldFocusWrap`, `renderEmptyState`,
 * `disallowEmptySelection`, `onClose`) have no meaning on a phone and are not accepted, and a
 * selection is always a `Set` of keys, never `"all"`.
 */
export function Menu<T extends object>({
  trigger,
  children,
  items,
  onAction,
  selectionMode = "none",
  selectedKeys,
  defaultSelectedKeys,
  onSelectionChange,
  disabledKeys,
  placement: _placement,
  ...openState
}: MenuProps<T>) {
  const [selected, setSelected] = useControlledState<ReadonlySet<Key>>(
    selectedKeys ? new Set(selectedKeys) : undefined,
    new Set(defaultSelectedKeys ?? []),
    onSelectionChange ? (next) => onSelectionChange(new Set(next)) : undefined,
  );
  const disabled = useMemo(() => new Set(disabledKeys ?? []), [disabledKeys]);
  const rendered =
    typeof children === "function"
      ? [...(items ?? [])].map((item, index) => (
          <Fragment key={(item as { id?: Key }).id ?? index}>{children(item)}</Fragment>
        ))
      : children;

  return (
    <Tray trigger={trigger} aria-label={triggerName(trigger)} {...openState}>
      {({ close }) => (
        <MenuContext.Provider
          value={{
            selectionMode,
            selectedKeys: selected,
            disabledKeys: disabled,
            activate: (id) => {
              if (selectionMode !== "none") {
                const next = new Set(selected);
                if (selectionMode === "single") {
                  next.clear();
                  next.add(id);
                } else if (next.has(id)) next.delete(id);
                else next.add(id);
                setSelected(next);
              }
              onAction?.(id);
              if (selectionMode !== "multiple") close();
            },
          }}
        >
          <View role="menu" style={styles.menu}>
            {rendered}
          </View>
        </MenuContext.Provider>
      )}
    </Tray>
  );
}

export interface MenuItemProps {
  id: Key;
  /** `negative` marks a destructive action such as Delete. */
  variant?: "default" | "negative";
  children: ReactNode;
  isDisabled?: boolean;
  /** Plain text of the item. Needed when `children` is not a string. */
  textValue?: string;
  /** Called when the item is pressed, before the menu's `onAction`. */
  onAction?: () => void;
  testID?: string;
}

/** `href` and the other link props of the Web part are not accepted; use `onAction` to navigate. */
export function MenuItem({
  id,
  variant = "default",
  children,
  isDisabled = false,
  textValue,
  onAction,
  testID,
}: MenuItemProps) {
  // Subscribes to theme changes: the icon color below is read from the style at render time.
  useUnistyles();
  const menu = useContext(MenuContext);
  const blocked = isDisabled || menu.disabledKeys.has(id);
  const isSelected = menu.selectedKeys.has(id);
  styles.useVariants({
    variant: variant === "negative" ? "negative" : undefined,
    disabled: blocked,
  });
  const role =
    menu.selectionMode === "single"
      ? "radio"
      : menu.selectionMode === "multiple"
        ? "checkbox"
        : "menuitem";
  return (
    <Pressable
      role={role}
      aria-label={textValue}
      aria-checked={menu.selectionMode === "none" ? undefined : isSelected}
      aria-disabled={blocked}
      disabled={blocked}
      testID={testID}
      onPress={() => {
        onAction?.();
        menu.activate(id);
      }}
      style={({ pressed }) => styles.item(pressed)}
    >
      <View style={styles.itemLabel}>
        <Content textStyle={styles.itemText} iconSize={styles.check.width}>
          {children}
        </Content>
      </View>
      {isSelected ? (
        <Check
          aria-hidden
          color={styles.itemText.color}
          size={styles.check.width}
          strokeWidth={styles.check.strokeWidth}
        />
      ) : null}
    </Pressable>
  );
}

export interface MenuSectionProps {
  /** Heading of the group. It is also the accessible name of the group. */
  title: string;
  children: ReactNode;
}

export function MenuSection({ title, children }: MenuSectionProps) {
  return (
    <View role="group" aria-label={title}>
      <NativeText style={styles.sectionHeader}>{title}</NativeText>
      {children}
    </View>
  );
}

export function MenuSeparator() {
  return <View role="separator" style={styles.separator} />;
}

const styles = StyleSheet.create((theme) => {
  const field = theme.scale.component.field;
  return {
    menu: { paddingVertical: theme.space["75"] },
    item: (pressed: boolean) => ({
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space["100"],
      minHeight: atLeastTarget(field.height.M, theme.scale.component["target-min"]),
      paddingHorizontal: field["padding-x"].M,
      borderRadius: theme.radius.control,
      backgroundColor: pressed ? theme.color.surface.sunken : "transparent",
    }),
    itemLabel: { flex: 1 },
    itemText: {
      ...fontStyle(theme, "body-sm"),
      color: theme.color.text.primary,
      variants: {
        variant: {
          default: { color: theme.color.text.primary },
          negative: { color: theme.color.negative.fg },
        },
        disabled: { true: { color: theme.color.text.disabled }, false: {} },
      },
    },
    check: {
      width: theme.scale.component.icon.size.S,
      strokeWidth: theme.icon["stroke-width"],
    },
    sectionHeader: {
      ...fontStyle(theme, "label-sm"),
      paddingVertical: theme.space["75"],
      paddingHorizontal: field["padding-x"].M,
      color: theme.color.text.secondary,
    },
    separator: {
      height: theme["border-width"].divider.S,
      marginVertical: theme.space["75"],
      backgroundColor: theme.color.border.hairline,
    },
  };
});
