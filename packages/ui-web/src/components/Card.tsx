import type { CardSize } from "@moonx/ui-tokens";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import {
  GridList,
  GridListItem,
  type Key,
  type Selection,
} from "react-aria-components";
import * as styles from "./Card.css";

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
  /** Above the text, edge to edge: a slide's thumbnail (23). */
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
  /** The last line, in the small secondary type (15's "1 source · 💬 1"). */
  footer?: ReactNode;
  /**
   * At the end of the last line: the card's ⋯ (an ActionMenu), the one button a card in a
   * CardView may hold (design-spec 4.5). Tab moves from the card to it.
   */
  actions?: ReactNode;
}

/**
 * Something to look at beside others (15's competitors, 23's thumbnails; design-spec
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
  actions,
}: CardProps) {
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
      {(footer != null || actions != null) && (
        <div className={styles.footer}>
          {footer != null && (
            <span className={styles.footerText}>{footer}</span>
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
  /** `single` keeps one card chosen (23's slide on screen). */
  selectionMode?: "none" | "single";
  selectedKeys?: Iterable<Key>;
  onSelectionChange?: (keys: Set<Key>) => void;
  renderEmptyState?: () => ReactNode;
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
  ...props
}: CardViewProps<T>) {
  return (
    <CardViewContext.Provider
      value={{
        size,
        isActionable: props.onAction !== undefined || selectionMode !== "none",
      }}
    >
      <GridList
        {...props}
        layout="grid"
        selectionMode={selectionMode}
        onSelectionChange={
          onSelectionChange
            ? (selection: Selection) =>
                onSelectionChange(
                  selection === "all" ? new Set() : new Set(selection),
                )
            : undefined
        }
        className={styles.view[size]}
      />
    </CardViewContext.Provider>
  );
}
