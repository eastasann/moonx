import { formatCount } from "@moonx/i18n";
import type { CardSize } from "@moonx/ui-tokens";
import { MessageSquare, Plus } from "lucide-react";
import {
  Children,
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import {
  Collection,
  GridList,
  GridListItem,
  type Key,
  type Selection,
  VisuallyHidden,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./Card.css";

/** The key of CardView's last tile, which adds instead of opening. */
const ADD_KEY = "moonx:card-view:add";

interface CardViewContextValue {
  size: CardSize;
  isActionable: boolean;
}

const CardViewContext = createContext<CardViewContextValue | null>(null);

/** A line of a Card's details: a label and its value (15's Target customer, Offering…). */
export interface CardDetail {
  id: string;
  label: ReactNode;
  value: ReactNode;
}

export interface CardProps {
  /** Inside a CardView: the card's key. */
  id?: Key;
  /** Inside a CardView: the card's text for screen readers and typing to find it. */
  textValue?: string;
  /** @default "M", or the CardView's size */
  size?: CardSize;
  /** Above the text, edge to edge: a picture of what the card is. */
  preview?: ReactNode;
  /** Above the title, in the small monospaced type (15's Direct competitor). Not upper-cased. */
  eyebrow?: ReactNode;
  title?: ReactNode;
  /**
   * At the top right, beside the title, in the monospaced face (15's price). Not named
   * `value`: React Aria passes a collection's item to its elements as `value`.
   */
  figure?: ReactNode;
  /** Under the figure (15's "per bowl"). */
  figureDescription?: ReactNode;
  /** The figure is a placeholder ("No price"): smaller and quieter. */
  isFigurePlaceholder?: boolean;
  description?: ReactNode;
  /**
   * Label and value lines divided by hairlines, the labels in a column (15). On a phone
   * each label sits above its value.
   */
  details?: readonly CardDetail[];
  /** The card's content under its details: values, StatusLights, chips. No buttons (4.5). */
  children?: ReactNode;
  /** The last line, in the small secondary type (15's "1 source"). */
  footer?: ReactNode;
  /**
   * After the footer's text: the comments' mark and how many threads on the item are not
   * resolved (15's "💬 1", design-spec 6.10). None shows nothing. @default 0
   */
  openThreadCount?: number;
  /**
   * At the end of the last line: the card's ⋯ (an ActionMenu), the one button a card in a
   * CardView may hold (design-spec 4.5). Tab moves from the card to it.
   */
  actions?: ReactNode;
}

/**
 * Something to look at beside others (15's competitors; design-spec
 * 4.4・4.5): framed without a shadow, its content stacked. Inside a CardView it is one of the
 * view's items and presses or is chosen as a whole; its ⋯ (`actions`) is the only button
 * it holds, and the other actions sit outside it.
 */
export function Card({
  id,
  textValue,
  size: ownSize,
  preview,
  eyebrow,
  title,
  figure,
  figureDescription,
  isFigurePlaceholder = false,
  description,
  details,
  children,
  footer,
  openThreadCount = 0,
  actions,
}: CardProps) {
  const { t } = useTranslation(["components"]);
  const view = useContext(CardViewContext);
  const size = ownSize ?? view?.size ?? "M";
  const hasHead = eyebrow != null || title != null || figure != null;
  const content = (
    <>
      {preview != null && <div className={styles.preview[size]}>{preview}</div>}
      {hasHead && (
        <div className={styles.head}>
          <div className={styles.headText}>
            {eyebrow != null && (
              <span className={styles.eyebrow}>{eyebrow}</span>
            )}
            {title != null && (
              <span className={styles.title[size]}>{title}</span>
            )}
          </div>
          {figure != null && (
            <span
              className={styles.figure({ isPlaceholder: isFigurePlaceholder })}
            >
              {figure}
              {figureDescription != null && (
                <span className={styles.figureDescription}>
                  {figureDescription}
                </span>
              )}
            </span>
          )}
        </div>
      )}
      {description != null && (
        <span className={styles.description[size]}>{description}</span>
      )}
      {details !== undefined && details.length > 0 && (
        <dl className={styles.details}>
          {details.map((detail) => (
            <div key={detail.id} className={styles.detail}>
              <dt className={styles.detailLabel}>{detail.label}</dt>
              <dd className={styles.detailValue}>{detail.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children != null && <div className={styles.content}>{children}</div>}
      {(footer != null || openThreadCount > 0 || actions != null) && (
        <div className={styles.footer}>
          {footer != null && (
            <span className={styles.footerText}>{footer}</span>
          )}
          {openThreadCount > 0 && (
            <span className={styles.comments}>
              <IconSlot size="XS">
                <MessageSquare />
              </IconSlot>
              <span aria-hidden="true">{formatCount(openThreadCount)}</span>
              <VisuallyHidden>
                {t("components:card.openThreads", {
                  count: openThreadCount,
                  formatted: formatCount(openThreadCount),
                })}
              </VisuallyHidden>
            </span>
          )}
          {actions != null && <span className={styles.actions}>{actions}</span>}
        </div>
      )}
    </>
  );
  if (view === null) {
    return (
      <div className={styles.card({ size, isActionable: false })}>
        {content}
      </div>
    );
  }
  if (id === undefined || textValue === undefined) {
    throw new Error("A Card in a CardView needs an id and a textValue");
  }
  return (
    <GridListItem
      id={id}
      textValue={textValue}
      className={styles.card({ size, isActionable: view.isActionable })}
    >
      {content}
    </GridListItem>
  );
}

export interface CardViewProps<T extends object> {
  /** The cards' data; `children` renders each as a `Card`. */
  items?: Iterable<T>;
  /** `Card`s, or a function from an item to its `Card`. */
  children: ReactNode | ((item: T) => ReactElement);
  dependencies?: readonly unknown[];
  /** @default "M" */
  size?: CardSize;
  /** Pressing a card: open it (15's edit). */
  onAction?: (key: Key) => void;
  /** `single` keeps one card chosen. */
  selectionMode?: "none" | "single";
  selectedKeys?: Iterable<Key>;
  onSelectionChange?: (keys: Set<Key>) => void;
  renderEmptyState?: () => ReactNode;
  /**
   * The last tile, in a dashed frame: "+ Add competitor" (15, s15-competitors.html
   * .addcard). Pressing it adds instead of opening a card.
   */
  addItem?: { label: string; onAction: () => void };
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * Cards in columns as many as the width holds, each at least the size's width (2〜3 on a
 * desktop for 15); one column on a phone (design-spec 4.1 E・4.5). The arrow keys move
 * between the cards in both directions, and Tab from a card to its ⋯.
 */
export function CardView<T extends object>({
  size = "M",
  selectionMode = "none",
  onSelectionChange,
  addItem,
  items,
  children,
  dependencies,
  onAction,
  ...props
}: CardViewProps<T>) {
  const cards =
    items === undefined ? (
      (children as ReactNode)
    ) : (
      <Collection items={items} dependencies={dependencies}>
        {children as (item: T) => ReactElement}
      </Collection>
    );
  // Without cards the empty state speaks (15's "List 3–5 competitors…" with its own add).
  const isEmpty =
    items === undefined
      ? Children.count(children as ReactNode) === 0
      : [...items].length === 0;
  const showsAdd =
    addItem !== undefined && !(isEmpty && props.renderEmptyState !== undefined);
  return (
    <CardViewContext.Provider
      value={{
        size,
        isActionable: onAction !== undefined || selectionMode !== "none",
      }}
    >
      <GridList
        {...props}
        layout="grid"
        // The add tile's own action runs alone: the cards' action skips its key.
        onAction={
          onAction === undefined
            ? undefined
            : (key) => {
                if (key !== ADD_KEY) onAction(key);
              }
        }
        selectionMode={selectionMode}
        // The add tile is an action, never a choice: it stays pressable.
        disabledKeys={
          showsAdd && selectionMode !== "none" ? [ADD_KEY] : undefined
        }
        disabledBehavior="selection"
        onSelectionChange={
          onSelectionChange
            ? (selection: Selection) =>
                onSelectionChange(
                  selection === "all" ? new Set() : new Set(selection),
                )
            : undefined
        }
        className={styles.view[size]}
      >
        {cards}
        {showsAdd && (
          <GridListItem
            id={ADD_KEY}
            textValue={addItem.label}
            onAction={addItem.onAction}
            className={styles.addTile}
          >
            <span className={styles.addTileLabel}>
              <IconSlot size="S">
                <Plus />
              </IconSlot>
              {addItem.label}
            </span>
          </GridListItem>
        )}
      </GridList>
    </CardViewContext.Provider>
  );
}
