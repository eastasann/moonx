import type { Size } from "@moonx/ui-tokens";
import { createContext, useContext } from "react";

/**
 * The size fields, buttons and choices (Checkbox, Radio, Switch) take when they are not
 * given one. `Density` sets it from the density of the pattern, the dialog or the `Form`
 * around: regular uses M, spacious L (06 semantic.density).
 */
export const SizeContext = createContext<Size>("M");

/** The given size, or the one the density around sets. */
export function useSize(size: Size | undefined): Size {
  const fromContext = useContext(SizeContext);
  return size ?? fromContext;
}

/**
 * Inside a phone's bottom bar (design-spec 4.3・4.5 Button): Buttons not given a size are
 * XL. `main`: the ones that are not quiet share the bar's width, the quiet ones (Cancel)
 * keeping their own (A, G); `all`: every Button shares it, Cancel too (B,
 * s19-decision.html .formbar). `false` outside a bar.
 */
export const BottomBarContext = createContext<false | "main" | "all">(false);

/**
 * The width fields take when they are not given one: `full` in the fields' column of a
 * settings group (pattern H, s09-settings.html: the fields fill the column), `fit` for a
 * member's role at the end of its row.
 */
export const FieldWidthContext = createContext<"default" | "full" | "fit">(
  "default",
);

/** The given width, or the one the surrounding settings group sets. */
export function useFieldWidth<W extends string>(
  width: W | undefined,
): W | "default" | "full" | "fit" {
  const fromContext = useContext(FieldWidthContext);
  return width ?? fromContext;
}
