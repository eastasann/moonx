// The app icon's shapes (design-spec 4.4「アプリのアイコン」). Written by hand: the PWA
// icons (scripts/pwa.ts, ADR-031) and the crescent mark of the sidebar and the public
// pages (packages/ui-web) draw the same geometry.

/** design-spec 4.4: the canvas, the crescent (a disc minus a disc) and the small dot. */
export const ICON_SHAPES = {
  size: 512,
  moon: { cx: 246, cy: 266, r: 150 },
  bite: { cx: 300, cy: 215, r: 132 },
  dot: { cx: 378, cy: 150, r: 28 },
} as const;
