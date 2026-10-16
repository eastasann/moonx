import type { Size } from "@moonx/ui-tokens";
import { ChevronRight } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import {
  Disclosure as AriaDisclosure,
  type DisclosureProps as AriaDisclosureProps,
  Heading as AriaHeading,
  Button,
  DisclosureGroup,
  type DisclosureGroupProps,
  DisclosurePanel,
} from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./Disclosure.css";

interface Look {
  size?: Size;
  isQuiet?: boolean;
}

const AccordionContext = createContext<Look>({});

export interface DisclosureProps
  extends Pick<
      AriaDisclosureProps,
      | "id"
      | "isExpanded"
      | "defaultExpanded"
      | "onExpandedChange"
      | "isDisabled"
    >,
    Look {
  /** The text of the button that opens and closes it. */
  title: ReactNode;
  /** The title's heading level in the page outline. @default 3 */
  headingLevel?: 2 | 3 | 4;
  /** Shown while open. */
  children: ReactNode;
}

/**
 * A titled block that opens and closes (EXAMPLE, related research, resolved threads;
 * design-spec 4.5). `isQuiet` drops the dividers for a title inline with others.
 * `size` and `isQuiet` default to the surrounding Accordion's, then M and false.
 */
export function Disclosure({
  title,
  headingLevel = 3,
  size: ownSize,
  isQuiet: ownQuiet,
  children,
  ...props
}: DisclosureProps) {
  const group = useContext(AccordionContext);
  const size = ownSize ?? group.size ?? "M";
  const isQuiet = ownQuiet ?? group.isQuiet ?? false;
  return (
    <AriaDisclosure {...props} className={styles.disclosure({ isQuiet })}>
      {({ isExpanded }) => (
        <>
          <AriaHeading level={headingLevel} className={styles.heading}>
            <Button
              slot="trigger"
              className={styles.trigger({ size, isQuiet })}
            >
              <span className={styles.chevron({ isExpanded })}>
                <IconSlot size={size}>
                  <ChevronRight />
                </IconSlot>
              </span>
              {title}
            </Button>
          </AriaHeading>
          <DisclosurePanel className={styles.panel}>
            <div className={styles.panelInner[size]}>{children}</div>
          </DisclosurePanel>
        </>
      )}
    </AriaDisclosure>
  );
}

export interface AccordionProps
  extends Pick<
      DisclosureGroupProps,
      | "allowsMultipleExpanded"
      | "expandedKeys"
      | "defaultExpandedKeys"
      | "onExpandedChange"
      | "isDisabled"
    >,
    Look {
  /** `Disclosure`s, each with an `id` to be opened by key. */
  children: ReactNode;
}

/** Disclosures as one group; by default opening one closes the others. */
export function Accordion({
  size,
  isQuiet,
  children,
  ...props
}: AccordionProps) {
  return (
    <DisclosureGroup {...props} className={styles.accordion}>
      <AccordionContext.Provider value={{ size, isQuiet }}>
        {children}
      </AccordionContext.Provider>
    </DisclosureGroup>
  );
}
