/**
 * Building blocks of the component gallery. The gallery is a development tool, not an app screen,
 * so its labels are written directly instead of coming from packages/i18n.
 */
import { COMPONENT_SIZES, type ComponentSize } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import {
  caseBody,
  caseBox,
  caseLabel,
  cases,
  casesColumn,
  casesFields,
  component,
  componentTitle,
  group,
  groupLabel,
  note,
  scrollable,
  section,
  sectionTitle,
} from "./preview.css";

export const SIZES = COMPONENT_SIZES;

export function GallerySection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={section}>
      <h2 id={`${id}-title`} className={sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One public component: its name, an optional remark, and the groups of cases below. */
export function Component({
  name,
  note: remark,
  children,
}: {
  name: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className={component}>
      <h3 className={componentTitle}>{name}</h3>
      {remark ? <p className={note}>{remark}</p> : null}
      {children}
    </div>
  );
}

/** A labelled row of cases (for example "Sizes" or "States"). */
export function Cases({
  label,
  layout = "row",
  children,
}: {
  label?: string;
  layout?: "row" | "column" | "fields";
  children: ReactNode;
}) {
  const className = layout === "fields" ? casesFields : layout === "column" ? casesColumn : cases;
  return (
    <div className={group}>
      {label ? <p className={groupLabel}>{label}</p> : null}
      <div className={className}>{children}</div>
    </div>
  );
}

/** One specimen with a caption saying which variant, size or state it shows. */
export function Case({
  label,
  scrollX = false,
  children,
}: {
  label: string;
  /** Lets a part that cannot shrink (a grid-layout table) scroll sideways instead of widening the page. */
  scrollX?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={caseBox}>
      <span className={caseLabel}>{label}</span>
      <div className={scrollX ? `${caseBody} ${scrollable}` : caseBody}>{children}</div>
    </div>
  );
}

/** One case per size S / M / L / XL. */
export function bySize(render: (size: ComponentSize) => ReactNode, sizes = SIZES) {
  return sizes.map((size) => (
    <Case key={size} label={`Size ${size}`}>
      {render(size)}
    </Case>
  ));
}
