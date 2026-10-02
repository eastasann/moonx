import type { ComponentSize } from "@moonx/ui-tokens";
import { createContext } from "react";

/** Lets a group (CheckboxGroup, RadioGroup, ...) hand its `size` to the items inside it. */
export const SizeContext = createContext<ComponentSize | undefined>(undefined);
