import { COMPONENT_SIZES, type ComponentSize } from "@moonx/ui-tokens";

/** Builds the `size` variant map of a recipe from one function over S / M / L / XL. */
export function sizeVariants<T>(build: (size: ComponentSize) => T): Record<ComponentSize, T> {
  return Object.fromEntries(COMPONENT_SIZES.map((size) => [size, build(size)])) as Record<
    ComponentSize,
    T
  >;
}
