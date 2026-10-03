import type { ReactTestInstance } from "react-test-renderer";

/** The nearest ancestor (starting at the node itself) whose style sets `key`. */
export function styleOf(node: ReactTestInstance, key: string): Record<string, unknown> {
  let current: ReactTestInstance | null = node;
  while (current) {
    const flat = ([] as unknown[]).concat(current.props.style ?? []).flat(3);
    const found = Object.assign({}, ...flat.filter(Boolean)) as Record<string, unknown>;
    if (key in found) return found;
    current = current.parent;
  }
  throw new Error(`no ancestor sets ${key}`);
}
