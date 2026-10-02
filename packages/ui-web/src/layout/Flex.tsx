import type { SpaceName } from "@moonx/ui-tokens";
import { spaceStep } from "@moonx/ui-tokens";
import type { ElementType, ReactNode } from "react";
import { container, flex, grid } from "./layout.css";

const step = (name: SpaceName | undefined) => (name ? spaceStep(name) : undefined);

export interface FlexProps {
  as?: ElementType;
  direction?: "row" | "column";
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  gap?: SpaceName;
  padding?: SpaceName;
  paddingX?: SpaceName;
  paddingY?: SpaceName;
  grow?: boolean;
  children?: ReactNode;
}

/** Row or column of children. Spacing takes token names only, e.g. `gap="space-300"`. */
export function Flex({
  as: Tag = "div",
  gap,
  padding,
  paddingX,
  paddingY,
  grow,
  children,
  ...rest
}: FlexProps) {
  return (
    <Tag
      className={flex({
        ...rest,
        gap: step(gap),
        padding: step(padding),
        paddingX: step(paddingX),
        paddingY: step(paddingY),
        grow: grow || undefined,
      })}
    >
      {children}
    </Tag>
  );
}

export type StackProps = Omit<FlexProps, "direction">;

/** Vertical `Flex`. */
export function Stack(props: StackProps) {
  return <Flex {...props} direction="column" />;
}

export interface GridProps {
  as?: ElementType;
  columns?: 1 | 2 | 3 | 4;
  align?: "start" | "center" | "stretch";
  gap?: SpaceName;
  padding?: SpaceName;
  children?: ReactNode;
}

/** Equal-width columns. Spacing takes token names only. */
export function Grid({ as: Tag = "div", gap, padding, children, ...rest }: GridProps) {
  return (
    <Tag className={grid({ ...rest, gap: step(gap), padding: step(padding) })}>{children}</Tag>
  );
}

export interface ContainerProps {
  as?: ElementType;
  /** `reading` is the single reading column, `content` the widest page content. */
  width?: "reading" | "content";
  children?: ReactNode;
}

/** Centers its children and caps the width at the reading column or the page content width. */
export function Container({ as: Tag = "div", width, children }: ContainerProps) {
  return <Tag className={container({ width })}>{children}</Tag>;
}
