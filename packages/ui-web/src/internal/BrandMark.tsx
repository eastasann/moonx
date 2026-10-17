import { ICON_SHAPES } from "@moonx/ui-tokens";
import { useId } from "react";

const { size, moon, bite, dot } = ICON_SHAPES;

/**
 * The app icon's crescent and dot in the text's colour (design-spec 4.4「アプリの
 * アイコン」): beside "moonx" at the top of the SideNav and of the public pages. A mark
 * only: the name beside it is the text that is read.
 */
export function BrandMark({ className }: { className: string }) {
  const maskId = useId();
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <mask id={maskId}>
        <rect width={size} height={size} fill="#fff" />
        <circle cx={bite.cx} cy={bite.cy} r={bite.r} fill="#000" />
      </mask>
      <circle
        cx={moon.cx}
        cy={moon.cy}
        r={moon.r}
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
      <circle cx={dot.cx} cy={dot.cy} r={dot.r} fill="currentColor" />
    </svg>
  );
}
