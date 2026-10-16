import type { Size } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useContext } from "react";
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  type TabListProps as AriaTabListProps,
  TabPanel as AriaTabPanel,
  type TabPanelProps as AriaTabPanelProps,
  type TabProps as AriaTabProps,
  Tabs as AriaTabs,
  type TabsProps as AriaTabsProps,
} from "react-aria-components";
import * as styles from "./Tabs.css";

const TabsSizeContext = createContext<Size>("M");

export interface TabsProps
  extends Pick<
    AriaTabsProps,
    | "selectedKey"
    | "defaultSelectedKey"
    | "onSelectionChange"
    | "disabledKeys"
    | "isDisabled"
    | "keyboardActivation"
  > {
  /** @default "M" */
  size?: Size;
  /** A `TabList`, then a `TabPanel` for each tab. */
  children: ReactNode;
}

/**
 * Views of one place switched in place (16 Assumptions / Risks, 22's five tabs, 28's
 * three; design-spec 4.5). Arrow keys move between the tabs.
 */
export function Tabs({ size = "M", children, ...props }: TabsProps) {
  return (
    <AriaTabs {...props} className={styles.tabs}>
      <TabsSizeContext.Provider value={size}>
        {children}
      </TabsSizeContext.Provider>
    </AriaTabs>
  );
}

export interface TabListProps
  extends Pick<AriaTabListProps<object>, "aria-label" | "aria-labelledby"> {
  /** `Tab`s. */
  children: ReactNode;
}

/** The row of tabs; it scrolls sideways when they do not fit. */
export function TabList({ children, ...props }: TabListProps) {
  return (
    <AriaTabList {...props} className={styles.tabList}>
      {children}
    </AriaTabList>
  );
}

export interface TabProps
  extends Pick<AriaTabProps, "id" | "isDisabled" | "href" | "routerOptions"> {
  children: ReactNode;
}

export function Tab({ children, ...props }: TabProps) {
  const size = useContext(TabsSizeContext);
  return (
    <AriaTab {...props} className={styles.tabSize[size]}>
      {children}
    </AriaTab>
  );
}

export interface TabPanelProps
  extends Pick<AriaTabPanelProps, "id" | "shouldForceMount"> {
  children: ReactNode;
}

/** The content of the tab with the same `id`. */
export function TabPanel({ children, ...props }: TabPanelProps) {
  return (
    <AriaTabPanel {...props} className={styles.tabPanel}>
      {children}
    </AriaTabPanel>
  );
}
