import type { DividerSize } from "@moonx/ui-tokens";
import { Separator } from "react-aria-components";
import { divider } from "./Divider.css";

export interface DividerProps {
  size?: DividerSize;
  orientation?: "horizontal" | "vertical";
}

export function Divider({ size = "S", orientation = "horizontal" }: DividerProps) {
  return <Separator orientation={orientation} className={divider({ size, orientation })} />;
}
