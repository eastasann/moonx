import type { ScreenDensity } from "@moonx/ui-tokens";
import { createContext, type ReactNode } from "react";
import { SizeContext } from "./size";

/**
 * The density of the screen's pattern or the dialog around (design-spec 4.4「密度とスケール
 * の対応」): the one a `Form` inside takes when it is given none.
 */
export const DensityContext = createContext<ScreenDensity>("regular");

/**
 * Sets the density of what is inside, and the size its fields and Buttons take when they
 * are given none: L in a spacious one, M in a regular one (06 semantic.density: "入力欄と
 * 主要なボタンは L"), inside a `Form` or not.
 */
export function Density({
  density,
  children,
}: {
  density: ScreenDensity;
  children: ReactNode;
}) {
  return (
    <DensityContext.Provider value={density}>
      <SizeContext.Provider value={density === "spacious" ? "L" : "M"}>
        {children}
      </SizeContext.Provider>
    </DensityContext.Provider>
  );
}
