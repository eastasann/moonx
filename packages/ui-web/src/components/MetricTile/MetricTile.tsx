import type { ReactNode } from "react";
import {
  label as labelStyle,
  note as noteStyle,
  tile,
  value as valueStyle,
} from "./MetricTile.css";

export interface MetricTileProps {
  /** What the number is, e.g. "Break-even". */
  label: string;
  /** The number as text, formatted by the screen with the i18n helpers, e.g. "₱450,000+" or "Empty". */
  value: string;
  /** The unit, a reason the number is missing or a warning, under the number. */
  note?: ReactNode;
}

/**
 * One key number: label, a large figure and an optional note. It is a `dl` entry so the label
 * names the value for assistive technology; place several tiles in a `Grid`.
 */
export function MetricTile({ label, value, note }: MetricTileProps) {
  return (
    <dl className={tile}>
      <dt className={labelStyle}>{label}</dt>
      <dd className={valueStyle}>{value}</dd>
      {note ? <dd className={noteStyle}>{note}</dd> : null}
    </dl>
  );
}
