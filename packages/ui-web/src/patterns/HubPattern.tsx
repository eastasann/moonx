import type { ReactNode } from "react";
import { useIsDesktop } from "../internal/useIsDesktop";
import { useIsNarrow } from "../internal/useIsNarrow";
import { MainActionBar, PageHeader } from "./PageHeader";
import * as styles from "./patterns.css";

/** One block of a hub: Next steps, Checks, Sections, Decisions… */
export interface HubBlock {
  id: string;
  /** Its column on a desktop: the main column or the side column. */
  column: "main" | "aside";
  content: ReactNode;
}

export interface HubPatternProps {
  /** The title and what goes under it (13: the decision, the stage, the concept). */
  header: ReactNode;
  /** Tools beside the title ("Edit summary", "AI ▼", ⋯). */
  actions?: ReactNode;
  /**
   * The screen's main action ("Record decision"): beside the title on tablet and wider,
   * fixed to the bottom on a phone (4.1 A).
   */
  primaryAction?: ReactNode;
  /** The key numbers across the top (13): a `MetricGroup`, a row on a desktop and 2×2 on a phone. */
  metrics?: ReactNode;
  /**
   * The blocks, in the order a phone and a tablet stack them (4.1 A: "the screen
   * decides"). A desktop puts each in its `column`, keeping this order within it.
   */
  blocks: HubBlock[];
}

/**
 * Pattern A, hub (design-spec 4.1): the whole of one thing, to choose where to go next
 * (5, 10, 13, 20). Desktop: the numbers across the top, then the main column and the side
 * column. Tablet: one column, in the phone's order. Phone: one column, the main action
 * fixed to the bottom.
 */
export function HubPattern({
  header,
  actions,
  primaryAction,
  metrics,
  blocks,
}: HubPatternProps) {
  const isDesktop = useIsDesktop();
  const isNarrow = useIsNarrow();
  const block = (item: HubBlock) => (
    <div key={item.id} className={styles.hubBlock}>
      {item.content}
    </div>
  );
  const column = (name: HubBlock["column"]) => (
    <div className={styles.hubColumn}>
      {blocks.filter((item) => item.column === name).map(block)}
    </div>
  );
  return (
    <div className={styles.root}>
      <div className={styles.page({ width: "content", density: "regular" })}>
        <PageHeader
          header={header}
          actions={actions}
          primaryAction={primaryAction}
          isNarrow={isNarrow}
        />
        {metrics}
        {isDesktop ? (
          <div className={styles.hubColumns}>
            {column("main")}
            {column("aside")}
          </div>
        ) : (
          // One column in the listed order, which is also the reading and Tab order.
          <div className={styles.hubColumn}>{blocks.map(block)}</div>
        )}
      </div>
      <MainActionBar primaryAction={primaryAction} isNarrow={isNarrow} />
    </div>
  );
}
