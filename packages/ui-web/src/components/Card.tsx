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

export interface CardProps {
  /** Inside a CardView: the card's key. */
  id?: Key;
  /** Inside a CardView: the card's text for screen readers and typing to find it. */
  textValue?: string;
  /** @default "M", or the CardView's size */
  size?: CardSize;
  /** Above the text, edge to edge: a slide's thumbnail (23). */
  preview?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /** The card's content under its title: values, StatusLights, chips. No buttons (4.5). */
  children?: ReactNode;
}

/**
 * Something to look at beside others (15's competitors, 23's thumbnails; design-spec
 * 4.4・4.5): framed and raised, its content stacked. Inside a CardView it is one of the
 * view's items and presses or is chosen as a whole, so it holds no buttons of its own:
 * actions sit outside it.
 */
export function Card({
  id,
  textValue,
  size: ownSize,
  preview,
  title,
  description,
  children,
}: CardProps) {
  const view = useContext(CardViewContext);
  const size = ownSize ?? view?.size ?? "M";
  const content = (
    <>
      {preview != null && <div className={styles.preview[size]}>{preview}</div>}
      {title != null && <span className={styles.title[size]}>{title}</span>}
      {description != null && (
        <span className={styles.description[size]}>{description}</span>
      )}
      {children != null && <div className={styles.content}>{children}</div>}
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
 * desktop for 15 at L); one column on a phone (design-spec 4.1 E・4.5). The arrow keys move
 * between the cards in both directions.
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
