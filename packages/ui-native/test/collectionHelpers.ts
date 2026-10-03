import { screen } from "@testing-library/react-native";

interface Json {
  props?: Record<string, unknown>;
  children?: (Json | string)[] | null;
}

/**
 * Host elements with this `role`. `getAllByRole` only finds accessible elements, and a plain
 * `View` with `role="listitem"` is not one, so structure checks walk the rendered tree.
 */
export function hostsWithRole(role: string): Json[] {
  const found: Json[] = [];
  const walk = (node: Json | string | (Json | string)[] | null) => {
    if (node === null || typeof node === "string") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node.props?.role === role) found.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(screen.toJSON() as Json | Json[] | null);
  return found;
}
