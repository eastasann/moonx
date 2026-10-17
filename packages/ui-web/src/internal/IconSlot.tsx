import type { IconSize } from "@moonx/ui-tokens";
import { LucideProvider } from "lucide-react";
import type { ReactNode } from "react";
import { iconSize } from "./icon.css";

/**
 * Sizes the Lucide icons inside it to the component's size, so screens pass icons
 * without props (`<ActionButton><MessageSquare /></ActionButton>`). Lucide marks icons
 * without an accessible name `aria-hidden`.
 */
export function IconSlot({
  size,
  children,
}: {
  size: IconSize | "nav";
  children: ReactNode;
}) {
  return <LucideProvider className={iconSize[size]}>{children}</LucideProvider>;
}
