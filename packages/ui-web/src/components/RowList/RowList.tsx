import type { ReactNode } from "react";
import { item, list } from "./RowList.css";

export interface RowListProps {
  /** Names the list for assistive technology. */
  "aria-label": string;
  /** Numbers the rows (Next steps). */
  ordered?: boolean;
  /** `RowListItem`s. */
  children: ReactNode;
}

/** A static list of rows separated by hairlines. Rows that open something hold a `Link`. */
export function RowList({ ordered = false, children, ...aria }: RowListProps) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag {...aria} data-ordered={ordered} className={list}>
      {children}
    </Tag>
  );
}

export interface RowListItemProps {
  children: ReactNode;
}

export function RowListItem({ children }: RowListItemProps) {
  return <li className={item}>{children}</li>;
}
