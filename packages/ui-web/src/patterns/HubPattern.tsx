import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTwoColumns } from "../internal/frame";
import { MainActionBar, PageHeader } from "./PageHeader";
import * as styles from "./patterns.css";

/** One block of a hub: Next steps, Checks, Sections, Decisions… */
export interface HubBlock {
  id: string;
  /** Its column on a desktop with room for two: the main column or the side column. */
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
  /**
   * The key numbers across the top (13): a `MetricGroup`, a row on a desktop and 2×2 on a
   * phone and beside a docked panel that leaves the body too narrow.
   */
  metrics?: ReactNode;
  /**
   * The blocks, in the order a phone and a tablet stack them (4.1 A: "the screen
   * decides"). A desktop whose body has room for two columns puts each in its `column`,
   * keeping this order within it.
   */
  blocks: HubBlock[];
}

/** `moveBefore` keeps focus and state in what it moves (Chromium 133 and later). */
type MovingElement = HTMLElement & {
  moveBefore?: (node: Node, child: Node | null) => void;
};

/** Puts `hosts` into `column` in this order, moving only those out of place. */
function arrange(column: MovingElement, hosts: HTMLElement[]) {
  for (const [index, host] of hosts.entries()) {
    const there = column.children[index] ?? null;
    if (there === host) continue;
    if (column.moveBefore !== undefined && host.isConnected) {
      column.moveBefore(host, there);
    } else {
      column.insertBefore(host, there);
    }
  }
}

/**
 * Puts the blocks' elements into the columns. Drawn before the blocks, so its layout
 * effect runs before theirs: a block's content is in the page by the time its own refs
 * and effects run.
 */
function ArrangeBlocks({
  blocks,
  hosts,
  isTwoColumns,
  mainColumn,
  sideColumn,
}: {
  blocks: HubBlock[];
  hosts: Map<string, HTMLElement>;
  isTwoColumns: boolean;
  mainColumn: RefObject<HTMLDivElement | null>;
  sideColumn: RefObject<HTMLDivElement | null>;
}) {
  useLayoutEffect(() => {
    const main = mainColumn.current;
    const side = sideColumn.current;
    if (main === null || side === null) return;
    for (const [id, host] of hosts) {
      if (blocks.some((item) => item.id === id)) continue;
      host.remove();
      hosts.delete(id);
    }
    const hostsOf = (items: HubBlock[]) =>
      items.flatMap((item) => hosts.get(item.id) ?? []);
    // Where `moveBefore` is missing, a browser takes focus from an element moved in the
    // page: it goes back to it.
    const focused = document.activeElement;
    if (isTwoColumns) {
      arrange(main, hostsOf(blocks.filter((item) => item.column === "main")));
      arrange(side, hostsOf(blocks.filter((item) => item.column === "aside")));
    } else {
      arrange(main, hostsOf(blocks));
    }
    if (
      focused instanceof HTMLElement &&
      focused !== document.activeElement &&
      focused.isConnected
    ) {
      focused.focus();
    }
  });
  return null;
}

/**
 * Pattern A, hub (design-spec 4.1, s05-dashboard.html, d1-moon.html): the whole of one
 * thing, to choose where to go next (5, 10, 13, 20). Desktop: the numbers across the top,
 * then the main column and the side column (7 : 5). Tablet, and a desktop whose docked
 * panel leaves the body too narrow: one column, in the phone's order. Phone: one column,
 * the main action fixed to the bottom.
 */
export function HubPattern({
  header,
  actions,
  primaryAction,
  metrics,
  blocks,
}: HubPatternProps) {
  const isTwoColumns = useTwoColumns();
  const mainColumn = useRef<HTMLDivElement>(null);
  const sideColumn = useRef<HTMLDivElement>(null);

  // Each block is drawn once, into an element of its own, which the arrangement moves
  // between the columns: changing arrangement keeps what is in a block (its state, the
  // focus, the button a panel was opened from) instead of drawing it again, and keeps the
  // document in the order shown, which is the reading and Tab order (4.1 A). The elements
  // are made as the blocks first come, and kept by their ids.
  const [hosts] = useState(() => new Map<string, HTMLElement>());
  const hostOf = (id: string) => {
    let host = hosts.get(id);
    if (host === undefined) {
      host = document.createElement("div");
      host.className = styles.hubBlock;
      hosts.set(id, host);
    }
    return host;
  };

  return (
    <div className={styles.root}>
      <div className={styles.hubPage}>
        <div className={styles.hubHeader}>
          <PageHeader
            header={header}
            actions={actions}
            primaryAction={primaryAction}
            isActionFixed
          />
        </div>
        {metrics != null && <div className={styles.hubMetrics}>{metrics}</div>}
        <div className={styles.hubColumns({ isTwoColumns })}>
          <div
            ref={mainColumn}
            className={styles.hubColumn({
              side: isTwoColumns ? "main" : "only",
            })}
          />
          <div
            ref={sideColumn}
            className={styles.hubColumn({
              side: isTwoColumns ? "aside" : "unused",
            })}
          />
        </div>
        <ArrangeBlocks
          blocks={blocks}
          hosts={hosts}
          isTwoColumns={isTwoColumns}
          mainColumn={mainColumn}
          sideColumn={sideColumn}
        />
        {blocks.map((item) =>
          createPortal(item.content, hostOf(item.id), item.id),
        )}
      </div>
      <MainActionBar primaryAction={primaryAction} />
    </div>
  );
}
