import { type SpaceName, spaceStep } from "@moonx/ui-tokens";
import { vars } from "../../theme";
import { skeleton } from "./Skeleton.css";

export interface SkeletonProps {
  /** `text` is one line of text, `block` a box (give it a `height`), `circle` an Avatar M. */
  shape?: "text" | "block" | "circle";
  /** Width as a space token; full width when omitted. Ignored for `circle`. */
  width?: SpaceName;
  /** Height as a space token. Ignored for `circle`; `text` follows the body font size. */
  height?: SpaceName;
}

/**
 * A placeholder shape for content that is loading. It is hidden from assistive technology: the
 * screen marks the loading region with `aria-busy` and names it.
 */
export function Skeleton({ shape = "text", width, height }: SkeletonProps) {
  const sized = shape !== "circle";
  return (
    <span
      aria-hidden="true"
      className={skeleton({ shape })}
      style={{
        width: sized && width ? vars.space[spaceStep(width)] : undefined,
        height: sized && shape === "block" && height ? vars.space[spaceStep(height)] : undefined,
      }}
    />
  );
}
