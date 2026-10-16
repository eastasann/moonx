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
 * checks, Next steps, Summary, Decisions and Plans.
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
  /** Before the text: a state's mark (MoonGlyph). */
  start?: ReactNode;
  /** At the end, before ›: a count or a state ("8/10", "Done (4)"). */
  end?: ReactNode;
  /** Moves without a URL; prefer `href` for a place. The whole row presses. */
  onPress?: () => void;
  /** Frames the row as a card: the first of 13's Next steps (design-spec 4.4・6.1). */
  isEmphasized?: boolean;
}

/**
 * A row of a RowList. With `href` or `onPress` the whole row is the target and ends in
 * › (design-spec 4.4: no underlined links in the text).
 */
export function RowListItem({
  children,
  description,
  start,
  end,
  href,
  routerOptions,
  onPress,
  isEmphasized = false,
}: RowListItemProps) {
  const ordered = useContext(OrderedContext);
  const isPressable = href !== undefined || onPress !== undefined;
  const rowClass = styles.row({ ordered, isPressable, isEmphasized });
  const content = (
    <>
      {start != null && <span className={styles.start}>{start}</span>}
      <span className={styles.main}>
        <span className={styles.text}>{children}</span>
        {description != null && (
          <span className={styles.description}>{description}</span>
        )}
      </span>
      {end != null && <span className={styles.end}>{end}</span>}
      {isPressable && (
        <span className={styles.chevron}>
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
