import { type RefObject, useLayoutEffect, useRef, useState } from "react";

/**
 * Scale that fits a canvas drawn at a fixed size into its frame's width. The canvas width is
 * read from the element, so the reference size stays in the `print.slide` token.
 */
export function useSlideScale<F extends HTMLElement, C extends HTMLElement>(): {
  frameRef: RefObject<F | null>;
  canvasRef: RefObject<C | null>;
  scale: number;
} {
  const frameRef = useRef<F | null>(null);
  const canvasRef = useRef<C | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    const update = (frameWidth: number) => {
      const canvasWidth = canvas.offsetWidth;
      if (canvasWidth > 0 && frameWidth > 0) setScale(frameWidth / canvasWidth);
    };
    update(frame.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return { frameRef, canvasRef, scale };
}
