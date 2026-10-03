import type { ComponentSize } from "@moonx/ui-tokens";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useContext } from "react";
import {
  Button as AriaButton,
  Disclosure as AriaDisclosure,
  DisclosureGroup,
  type DisclosureGroupProps,
  DisclosurePanel,
  Heading,
  type Key,
} from "react-aria-components";
import { SizeContext } from "../_internal/SizeContext";
import {
  accordion,
  chevron,
  disclosure,
  heading,
  panel,
  panelContent,
  trigger,
} from "./Disclosure.css";

export interface DisclosureProps {
  /** Required inside an `Accordion`, where it identifies the item. */
  id?: Key;
  /** Required. The content of the toggle button, which is the disclosure's accessible name. */
  title: ReactNode;
  children: ReactNode;
  /** Level of the heading that wraps the toggle button. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  isExpanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (isExpanded: boolean) => void;
  isDisabled?: boolean;
  /** Text, icon and toggle height. Inside an `Accordion` it defaults to the accordion's. */
  size?: ComponentSize;
}

/** A section that opens and closes. The open state is `data-expanded` on the root element. */
export function Disclosure({
  title,
  children,
  headingLevel = 3,
  size: sizeProp,
  ...props
}: DisclosureProps) {
  const groupSize = useContext(SizeContext);
  const size = sizeProp ?? groupSize ?? "M";
  return (
    <AriaDisclosure {...props} className={disclosure}>
      <Heading level={headingLevel} className={heading}>
        <AriaButton slot="trigger" className={trigger({ size })}>
          <ChevronRight aria-hidden className={chevron({ size })} />
          {title}
        </AriaButton>
      </Heading>
      <DisclosurePanel className={panel}>
        <div className={panelContent}>{children}</div>
      </DisclosurePanel>
    </AriaDisclosure>
  );
}

export interface AccordionProps
  extends Omit<DisclosureGroupProps, "className" | "style" | "children"> {
  /** `Disclosure` items, each with an `id`. */
  children: ReactNode;
  /** Size handed to every `Disclosure` inside. */
  size?: ComponentSize;
}

/** A stack of `Disclosure` items. One item is open at a time unless `allowsMultipleExpanded`. */
export function Accordion({ size = "M", ...props }: AccordionProps) {
  return (
    <SizeContext.Provider value={size}>
      <DisclosureGroup {...props} className={accordion} />
    </SizeContext.Provider>
  );
}
