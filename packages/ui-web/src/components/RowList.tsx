import { ChevronRight } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import {
  Link as AriaLink,
  type LinkProps as AriaLinkProps,
  Button,
} from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./RowList.css";

const OrderedContext = createContext(false);

export interface RowListProps {
  /** Numbers the rows (13's Next steps). */
  ordered?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** `RowListItem`s. */
  children: ReactNode;
}

/**
 * Rows divided by lines, not boxes (design-spec 4.4・4.5): 10・13・20's section lists, 13's
 * checks, Next steps, Decisions and Plans. A hairline runs above the first row and under
 * every row; when some rows have a mark, the others keep its column empty, so the names
 * line up (d1-moon.html).
 */
export function RowList({ ordered = false, children, ...props }: RowListProps) {
  const List = ordered ? "ol" : "ul";
  return (
    <List {...props} className={styles.list({ ordered })}>
      <OrderedContext.Provider value={ordered}>
        {children}
      </OrderedContext.Provider>
    </List>
  );
}

export interface RowListItemProps
  extends Pick<AriaLinkProps, "href" | "routerOptions"> {
  /** The row's main line. */
  children: ReactNode;
  /** A second line under it: a reason ("2 rows are Empty"), an excerpt. */
  description?: ReactNode;
  /** Before the text, in its own column: a state's mark (MoonGlyph). */
  start?: ReactNode;
  /** At the end, before ›: a count or a state ("8/10", "Done (4)"). */
  end?: ReactNode;
  /** The end is a count or a date ("7/10", "5 entries", "Oct 14"): set in the monospaced face. */
  isEndNumeric?: boolean;
  /**
   * A row of marks beside the text (5's CheckDots): before the badge on a wide screen; on
   * a phone on a line of its own under the description (s05-dashboard.html .ideas .dots).
   */
  marks?: ReactNode;
  /**
   * A Badge (5's decision) at the end of a column as wide in every row (06
   * row-list.badge-width), so the marks before it line up down the list; on a phone at
   * the top right, beside the name.
   */
  badge?: ReactNode;
  /** Moves without a URL; prefer `href` for a place. The whole row presses. */
  onPress?: () => void;
  /**
   * Frames the row as a card with an ink line at its start, its number and name larger:
   * the first of 13's Next steps (design-spec 4.4・6.1).
   */
  isEmphasized?: boolean;
}

/**
 * A row of a RowList. With `href` or `onPress` the whole row is the target and ends in
 * › (design-spec 4.4: no underlined links in the text); the pointer over it underlines its
 * name.
 */
export function RowListItem({
  children,
  description,
  start,
  end,
  isEndNumeric = false,
  marks,
  badge,
  href,
  routerOptions,
  onPress,
  isEmphasized = false,
}: RowListItemProps) {
  const ordered = useContext(OrderedContext);
  const isPressable = href !== undefined || onPress !== undefined;
  // With a second line, the mark, the end and › stay beside the first (d1-moon.html).
  const hasDescription = description != null;
  const hasStatus = marks != null || badge != null;
  const rowClass = styles.row({
    ordered,
    isPressable,
    isEmphasized,
    hasDescription,
    hasMarks: marks != null,
  });
  const side = { hasDescription };
  const content = (
    <>
      {start != null && <span className={styles.start(side)}>{start}</span>}
      <span className={styles.main}>
        <span className={styles.text({ isEmphasized })}>{children}</span>
        {description != null && (
          <span className={styles.description}>{description}</span>
        )}
      </span>
      {marks != null && <span className={styles.marks}>{marks}</span>}
      {badge != null && <span className={styles.badge}>{badge}</span>}
      {end != null && (
        <span className={styles.end({ ...side, isNumeric: isEndNumeric })}>
          {end}
        </span>
      )}
      {isPressable && (
        <span className={styles.chevron({ ...side, hasStatus })}>
          <IconSlot size="S">
            <ChevronRight />
          </IconSlot>
        </span>
      )}
    </>
  );
  return (
    <li className={styles.item({ isEmphasized })}>
      {href !== undefined ? (
        <AriaLink
          href={href}
          routerOptions={routerOptions}
          onPress={onPress}
          className={rowClass}
        >
          {content}
        </AriaLink>
      ) : onPress !== undefined ? (
        <Button onPress={onPress} className={rowClass}>
          {content}
        </Button>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  );
}

/**
 * The mark at a row's start for a task not done yet (5's Due soon: ☐, design-spec 6.9).
 * Only drawn: the row's name says what the task is.
 */
export function TaskMark() {
  return <span aria-hidden="true" className={styles.taskMark} />;
}
