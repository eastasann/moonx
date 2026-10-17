import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  APP_NAME,
  ICON_PNGS,
  ICON_SHAPES,
  iconColors,
  iconPngs,
  iconSvg,
  MASKABLE_SAFE_RADIUS,
  manifest,
} from "./pwa";
import { loadTokens } from "./tokens";

const tree = await loadTokens();
const colors = iconColors(tree);

test("takes the icon colours from the light semantic values (design-spec 4.4)", () => {
  expect(colors).toEqual({ background: "#f4f5f8", foreground: "#191c2a" });
});

test("keeps the moon and the dot inside the maskable safe zone", () => {
  const { size, moon, dot } = ICON_SHAPES;
  const centre = size / 2;
  const reach = ({ cx, cy, r }: { cx: number; cy: number; r: number }) =>
    Math.hypot(cx - centre, cy - centre) + r;
  // The crescent lies inside the moon's disc, so the disc bounds it.
  expect(reach(moon)).toBeLessThanOrEqual(size * MASKABLE_SAFE_RADIUS);
  expect(reach(dot)).toBeLessThanOrEqual(size * MASKABLE_SAFE_RADIUS);
});

describe("iconPngs", async () => {
  const pngs = await iconPngs(iconSvg(tree));
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

  test("makes every PNG of ADR-031, opaque, at its size", async () => {
    expect([...pngs.keys()].sort()).toEqual(Object.keys(ICON_PNGS).sort());
    for (const [name, png] of pngs) {
      const meta = await sharp(png).metadata();
      const size = ICON_PNGS[name as keyof typeof ICON_PNGS];
      expect({ name, ...meta }).toMatchObject({
        name,
        format: "png",
        width: size,
        height: size,
        channels: 3,
      });
    }
  });

  test("draws the crescent, the bite and the dot", async () => {
    const png = pngs.get("icon-512.png");
    if (png === undefined) throw new Error("no icon-512.png");
    const { data, info } = await sharp(png)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const ink = rgb(colors.foreground);
    const paper = rgb(colors.background);
    expect(at(4, 4)).toEqual(paper);
    // Inside the moon, outside the bite: the lower left of the crescent.
    expect(at(150, 330)).toEqual(ink);
    expect(at(ICON_SHAPES.bite.cx, ICON_SHAPES.bite.cy)).toEqual(paper);
    expect(at(ICON_SHAPES.dot.cx, ICON_SHAPES.dot.cy)).toEqual(ink);
  });
});

test("describes the app as ADR-031 says", () => {
  expect(manifest(tree)).toEqual({
    name: APP_NAME,
    short_name: APP_NAME,
    display: "standalone",
    start_url: "/",
    scope: "/",
    theme_color: colors.background,
    background_color: colors.background,
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
  });
  expect(APP_NAME).toBe("moonx");
});
