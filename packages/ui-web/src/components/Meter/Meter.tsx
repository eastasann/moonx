import type { ComponentSize, StatusLightVariant } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { useId } from "react";
import { visuallyHidden } from "../../styles.css";
import {
  band,
  description as descriptionStyle,
  header,
  legend,
  legendItem,
  legendValue,
  meter,
  segment as segmentStyle,
  swatch,
} from "./Meter.css";

export interface MeterSegment {
  /** Name of the part, e.g. "Fact". Shown in the legend and read by assistive technology. */
  label: string;
  /** Size of the part; negative and non-finite values count as 0. */
  value: number;
  variant: StatusLightVariant;
  /** The part's value as text, e.g. "6 answers". Formatted by the screen with the i18n helpers. */
  valueLabel?: string;
}

export interface MeterProps {
  /** What the band measures, e.g. "Answers by F/A/U". Names the whole group. */
  label: string;
  /** Summary of the whole, e.g. "10 answers". Shown beside the label and read after it. */
  description?: ReactNode;
  /** The parts, in drawing order. */
  segments: readonly MeterSegment[];
  /** The value the full band stands for. Defaults to the sum of the segments. */
  maxValue?: number;
  /** Shows the legend. When false it stays in the page for assistive technology only. */
  showLegend?: boolean;
  size?: ComponentSize;
}

const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * A stacked meter: one band split into the parts of a whole. It is a `group` rather than
 * `role="meter"` because a single meter value cannot describe several parts; each part is a list
 * item that is always in the page (visibly as the legend, or visually hidden).
 */
export function Meter({
  label,
  description,
  segments,
  maxValue,
  showLegend = true,
  size = "M",
}: MeterProps) {
  const labelId = useId();
  const descriptionId = useId();
  const sum = segments.reduce((total, s) => total + safe(s.value), 0);
  const total = Math.max(sum, safe(maxValue ?? 0));
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset cannot be laid out as a flex column with a custom header.
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      className={meter}
    >
      <div className={header}>
        <span id={labelId}>{label}</span>
        {description ? (
          <span id={descriptionId} className={descriptionStyle}>
            {description}
          </span>
        ) : null}
      </div>
      <div aria-hidden="true" className={band({ size })}>
        {segments.map((s, index) =>
          safe(s.value) > 0 ? (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: segments have no id and label plus variant can repeat; the list is positional
              key={`${index}-${s.label}-${s.variant}`}
              className={segmentStyle({ variant: s.variant })}
              style={{ width: `${(safe(s.value) / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <ul className={showLegend ? legend : visuallyHidden}>
        {segments.map((s, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments have no id and label plus variant can repeat; the list is positional
          <li key={`${index}-${s.label}-${s.variant}`} className={legendItem}>
            <span aria-hidden="true" className={swatch({ variant: s.variant })} />
            <span>{s.label}</span>
            {s.valueLabel ? (
              <>
                {" "}
                <span className={legendValue}>{s.valueLabel}</span>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
