import { COMPONENT_SIZES, type ComponentSize } from "@moonx/ui-tokens";

/** Builds the `size` variant map of a Unistyles style from one function over S / M / L / XL. */
export function sizeVariants<T>(build: (size: ComponentSize) => T): Record<ComponentSize, T> {
  return Object.fromEntries(COMPONENT_SIZES.map((size) => [size, build(size)])) as Record<
    ComponentSize,
    T
  >;
}

/**
 * Grows a control's visual size to the minimum touch target without shrinking larger sizes
 * (design-spec 4.3, `semantic.scale.component.target-min`).
 */
export const atLeastTarget = (size: number, targetMin: number) => Math.max(size, targetMin);
