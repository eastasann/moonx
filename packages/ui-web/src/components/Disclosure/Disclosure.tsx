import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button as AriaButton,
  Disclosure as AriaDisclosure,
  DisclosureGroup,
  type DisclosureGroupProps,
  DisclosurePanel,
  Heading,
  type Key,
} from "react-aria-components";
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
}

/** A section that opens and closes. The open state is `data-expanded` on the root element. */
export function Disclosure({ title, children, headingLevel = 3, ...props }: DisclosureProps) {
  return (
    <AriaDisclosure {...props} className={disclosure}>
      <Heading level={headingLevel} className={heading}>
        <AriaButton slot="trigger" className={trigger}>
          <ChevronRight aria-hidden className={chevron} />
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
}

/** A stack of `Disclosure` items. One item is open at a time unless `allowsMultipleExpanded`. */
export function Accordion(props: AccordionProps) {
  return <DisclosureGroup {...props} className={accordion} />;
}
