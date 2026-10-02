import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { meQuery } from "../lib/session";
import { applyTheme } from "../lib/theme";

/** Keeps `<html data-theme>` on the display mode of the signed-in account; it never fetches. */
export function ThemeSync() {
  const { data } = useQuery({ ...meQuery, enabled: false });
  useEffect(() => applyTheme(data?.theme), [data?.theme]);
  return null;
}
