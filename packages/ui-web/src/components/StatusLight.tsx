import type { Size, StatusLightVariant } from "@moonx/ui-tokens";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { IconSlot } from "../internal/IconSlot";
import * as moonStyles from "../internal/moon.css";
import { MoonGlyphAt } from "./MoonGlyph";
import * as styles from "./StatusLight.css";

const labelColour = {
  fact: moonStyles.labelColor.fact,
  done: moonStyles.labelColor.done,
  assumption: moonStyles.labelColor.assumption,
  partial: moonStyles.labelColor.partial,
  unknown: moonStyles.labelColor.unknown,
  "not-started": moonStyles.labelColor["not-started"],
  unclassified: moonStyles.labelColor.unclassified,
  empty: moonStyles.labelColor.empty,
  saving: styles.label.quiet,
  saved: styles.label.quiet,
  "save-failed": styles.label.failed,
} as const satisfies Record<StatusLightVariant, string>;

const saveIcons = {
  saving: <LoaderCircle />,
  saved: <Check />,
  "save-failed": <TriangleAlert />,
};

export interface StatusLightProps {
  /**
   * The F/A/U state, the check state, or the save state (design-spec 4.5). F/A/U and check
   * states show their moon; save states an icon.
   */
  variant: StatusLightVariant;
  /** @default "M" */
  size?: Size;
  /** The label, always shown: shape or colour alone does not tell the state (4.4). */
  children: ReactNode;
  /**
   * `status` announces changes, for one light that changes while the screen is open (the
   * header's save state).
   */
  role?: "status";
}

/** A state shown as its mark and its label ("◐ Assumption · Medium", "✓ Saved"). */
export function StatusLight({
  variant,
  size = "M",
  children,
  role,
}: StatusLightProps) {
  const mark =
    variant === "saving" || variant === "saved" || variant === "save-failed" ? (
      <span
        className={variant === "saving" ? styles.spinning : styles.icon}
        aria-hidden="true"
      >
        <IconSlot size={size}>{saveIcons[variant]}</IconSlot>
      </span>
    ) : (
      <MoonGlyphAt state={variant} size={size} />
    );
  return (
    <span
      role={role}
      className={`${styles.root[size]} ${labelColour[variant]}`}
    >
      {mark}
      <span>{children}</span>
    </span>
  );
}
