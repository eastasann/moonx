import type { Me } from "@moonx/schemas";

/** Applies the display mode to `<html>`: System removes the attribute so the OS setting decides. */
export function applyTheme(theme: Me["theme"] | undefined) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
}
