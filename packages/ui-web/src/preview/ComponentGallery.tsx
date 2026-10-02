/**
 * The component gallery: every public ui-web component and layout pattern with its variants, sizes
 * and states, plus header controls for the theme, the scale and the window width. It is a
 * development tool, not an app screen, so its labels are written here instead of coming from
 * packages/i18n.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "../components/Link";
import { useIsNarrow } from "../components/ResponsivePopover";
import { SegmentedControl, SegmentedControlItem } from "../components/SegmentedControl";
import { breakpoints } from "../theme";
import { ActionsSection } from "./ActionsSection";
import { AppPartsSection } from "./AppPartsSection";
import { CollectionsSection } from "./CollectionsSection";
import { FeedbackSection } from "./FeedbackSection";
import { FieldsSection } from "./FieldsSection";
import { LayoutSection } from "./LayoutSection";
import { OverlaysSection } from "./OverlaysSection";
import {
  control,
  controlLabel,
  controls,
  gallery,
  header,
  headerRow,
  jumpList,
  main,
  readout,
  title,
} from "./preview.css";

const THEMES = ["system", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const SCALES = ["auto", "medium", "large"] as const;
type Scale = (typeof SCALES)[number];

const SECTIONS = [
  { id: "actions", label: "Actions" },
  { id: "fields", label: "Fields" },
  { id: "overlays", label: "Overlays" },
  { id: "feedback", label: "Status and feedback" },
  { id: "collections", label: "Collections" },
  { id: "app", label: "App parts" },
  { id: "layout", label: "Layout" },
] as const;

const isTheme = (value: string): value is Theme => (THEMES as readonly string[]).includes(value);
const isScale = (value: string): value is Scale => (SCALES as readonly string[]).includes(value);

/** Sets the attribute for an explicit choice and removes it for the automatic one. */
function applyAttribute(name: "data-theme" | "data-scale", value: string | null) {
  const root = document.documentElement;
  if (value === null) root.removeAttribute(name);
  else root.setAttribute(name, value);
}

function readAttribute<T extends string>(
  name: "data-theme" | "data-scale",
  guard: (value: string) => value is T,
  fallback: T,
): T {
  const value = document.documentElement.getAttribute(name);
  return value !== null && guard(value) ? value : fallback;
}

function subscribeWidth(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function useWindowWidth() {
  return useSyncExternalStore(
    subscribeWidth,
    () => window.innerWidth,
    () => 0,
  );
}

function layoutName(width: number) {
  if (width >= breakpoints.desktop) return "Desktop";
  return width >= breakpoints.tablet ? "Tablet" : "Mobile";
}

/** Window width, the layout it falls in, and what Popover-like overlays become at that width. */
function WidthReadout() {
  const width = useWindowWidth();
  const narrow = useIsNarrow();
  return (
    <p className={readout} aria-live="off">
      {`Window ${width} px, ${layoutName(width)} layout, overlays open as a ${narrow ? "Tray" : "Popover"}`}
    </p>
  );
}

export function ComponentGallery() {
  const [theme, setTheme] = useState<Theme>(() => readAttribute("data-theme", isTheme, "system"));
  const [scale, setScale] = useState<Scale>(() => readAttribute("data-scale", isScale, "auto"));

  useEffect(() => {
    applyAttribute("data-theme", theme === "system" ? null : theme);
  }, [theme]);
  useEffect(() => {
    applyAttribute("data-scale", scale === "auto" ? null : scale);
  }, [scale]);
  useEffect(
    () => () => {
      applyAttribute("data-theme", null);
      applyAttribute("data-scale", null);
    },
    [],
  );

  return (
    <div className={gallery}>
      <header className={header}>
        <div className={headerRow}>
          <h1 className={title}>Component gallery</h1>
          <div className={controls}>
            <div className={control}>
              <span className={controlLabel}>Theme</span>
              <SegmentedControl
                aria-label="Theme"
                size="S"
                value={theme}
                onChange={(value) => isTheme(value) && setTheme(value)}
              >
                <SegmentedControlItem value="system">System</SegmentedControlItem>
                <SegmentedControlItem value="light">Light</SegmentedControlItem>
                <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
              </SegmentedControl>
            </div>
            <div className={control}>
              <span className={controlLabel}>Scale</span>
              <SegmentedControl
                aria-label="Scale"
                size="S"
                value={scale}
                onChange={(value) => isScale(value) && setScale(value)}
              >
                <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
                <SegmentedControlItem value="medium">Medium</SegmentedControlItem>
                <SegmentedControlItem value="large">Large</SegmentedControlItem>
              </SegmentedControl>
            </div>
          </div>
        </div>
        <WidthReadout />
        <nav aria-label="Gallery sections">
          <ul className={jumpList}>
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <Link href={`#${section.id}`} variant="secondary">
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className={main}>
        <ActionsSection />
        <FieldsSection />
        <OverlaysSection />
        <FeedbackSection />
        <CollectionsSection />
        <AppPartsSection />
        <LayoutSection />
      </main>
    </div>
  );
}
