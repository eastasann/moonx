// The PWA manifest and icons (ADR-031). The icon's shapes are design-spec 4.4「アプリの
// アイコン」; its colours are the light semantic values it names.

import sharp from "sharp";
import {
  flattenTokens,
  isObject,
  resolveToken,
  type TokenTree,
} from "./tokens";

/** design-spec 4.4: the canvas, the crescent (a disc minus a disc) and the small dot. */
export const ICON_SHAPES = {
  size: 512,
  moon: { cx: 246, cy: 266, r: 150 },
  bite: { cx: 300, cy: 215, r: 132 },
  dot: { cx: 378, cy: 150, r: 28 },
} as const;

/** The radius of the maskable safe zone: 40% of the icon's width (W3C manifest). */
export const MASKABLE_SAFE_RADIUS = 0.4;

/** The service name (design-spec 1.2「配り方と名前」). */
export const APP_NAME = "moonx";

/** The PNGs of ADR-031, by file name, with their width and height in px. */
export const ICON_PNGS = {
  "favicon.png": 32,
  "apple-touch-icon.png": 180,
  "icon-192.png": 192,
  "icon-512.png": 512,
  "icon-maskable-512.png": 512,
} as const;

/** The light semantic colours the icon and the manifest use, as `#rrggbb`. */
export function iconColors(tree: TokenTree): {
  background: string;
  foreground: string;
} {
  const tokens = flattenTokens(tree);
  const hex = (path: string) => {
    const resolved = resolveToken(tokens, path, "medium");
    if (resolved.kind !== "literal" || !isObject(resolved.value)) {
      throw new Error(`${path} is not a colour`);
    }
    return String(resolved.value.hex);
  };
  return {
    background: hex("semantic.color.light.surface.canvas"),
    foreground: hex("semantic.color.light.text.primary"),
  };
}

/** `icon.svg`: the 512 square, also the source of every PNG. */
export function iconSvg(tree: TokenTree): string {
  const { background, foreground } = iconColors(tree);
  const { size, moon, bite, dot } = ICON_SHAPES;
  // The mask cuts the bite out of the disc exactly, which a path of arcs would only
  // approximate with rounded intersection points.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <title>${APP_NAME}</title>
  <mask id="crescent">
    <rect width="${size}" height="${size}" fill="#fff"/>
    <circle cx="${bite.cx}" cy="${bite.cy}" r="${bite.r}" fill="#000"/>
  </mask>
  <rect width="${size}" height="${size}" fill="${background}"/>
  <circle cx="${moon.cx}" cy="${moon.cy}" r="${moon.r}" fill="${foreground}" mask="url(#crescent)"/>
  <circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${foreground}"/>
</svg>
`;
}

/**
 * The PNGs, rasterised from the SVG at each size by sharp. The icon is opaque, so the
 * alpha channel is dropped (iOS fills transparency with black on the home screen).
 */
export async function iconPngs(svg: string): Promise<Map<string, Buffer>> {
  const pngs = new Map<string, Buffer>();
  for (const [name, size] of Object.entries(ICON_PNGS)) {
    const png = await sharp(Buffer.from(svg), {
      density: (72 * size) / ICON_SHAPES.size,
    })
      .removeAlpha()
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
      .toBuffer();
    pngs.set(name, png);
  }
  return pngs;
}

/** `manifest.webmanifest` (ADR-031). The icons are served under `/icons/`. */
export function manifest(tree: TokenTree): Record<string, unknown> {
  const { background } = iconColors(tree);
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    display: "standalone",
    start_url: "/",
    scope: "/",
    theme_color: background,
    background_color: background,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
