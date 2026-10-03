import type { ComponentSize } from "@moonx/ui-tokens";
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
import { tab, tabList, tabPanel, tabs } from "./Tabs.css";

export interface TabsProps extends Omit<AriaTabsProps, "className" | "style" | "orientation"> {
  size?: ComponentSize;
}

/** Horizontal tabs: `<Tabs><TabList aria-label=…><Tab id=…/></TabList><TabPanel id=…/></Tabs>`. */
export function Tabs({ size = "M", ...props }: TabsProps) {
  return <AriaTabs {...props} className={tabs({ size })} />;
}

export interface TabListProps<T extends object>
  extends Omit<AriaTabListProps<T>, "className" | "style" | "aria-label" | "aria-labelledby"> {
  /** Required: the name of the set of tabs. */
  "aria-label": string;
}

export function TabList<T extends object>(props: TabListProps<T>) {
  return <AriaTabList {...props} className={tabList} />;
}

export interface TabProps extends Omit<AriaTabProps, "className" | "style"> {}

export function Tab(props: TabProps) {
  return <AriaTab {...props} className={tab} />;
}

export interface TabPanelProps extends Omit<AriaTabPanelProps, "className" | "style"> {}

/**
 * Keyed by `id` because a panel that stays mounted while its `id` changes (one `<TabPanel id={tab}>`
 * for the selected tab) keeps the DOM id it first rendered with, so the selected tab's
 * `aria-controls` then points at nothing.
 */
export function TabPanel(props: TabPanelProps) {
  return <AriaTabPanel key={props.id} {...props} className={tabPanel} />;
}
