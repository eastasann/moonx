import { print } from "@moonx/ui-tokens/print";

/**
 * A length of the slide (06 `semantic.print`, in pt as the PDF sets it) as a share of the
 * slide's width on screen: the whole slide scales with its place, as the PDF's page does
 * with the viewer's zoom (design-spec 6.14).
 */
export const slideUnits = (pt: number) =>
  `${(pt / print.slide.width) * 100}cqw`;
