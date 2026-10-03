/** Position and size of a view in window coordinates. */
interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A native view or text input: anything with `measureInWindow`. */
export interface Measurable {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
}

/** `measureInWindow` as a promise. */
export function measureInWindow(node: Measurable): Promise<WindowRect> {
  return new Promise((resolve) => {
    node.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}
