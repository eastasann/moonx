import { Heading } from "@moonx/ui-web";
import type { ReactNode } from "react";

/** The title of one block of the home. */
export function BlockHeading({ children }: { children: ReactNode }) {
  return (
    <Heading level={2} variant="heading-3">
      {children}
    </Heading>
  );
}
