import type { Size } from "@moonx/ui-tokens";
import { createContext, useContext } from "react";

/**
 * The size fields and buttons take when they are not given one. `Form` sets it from its
 * density: regular uses M, spacious L (06 semantic.density).
 */
export const SizeContext = createContext<Size>("M");

/** The given size, or the one the surrounding `Form` sets. */
export function useSize(size: Size | undefined): Size {
  const fromContext = useContext(SizeContext);
  return size ?? fromContext;
}
