import { act } from "@testing-library/react";
import { vi } from "vitest";

/** Phone width: below `semantic.breakpoint.tablet`, where overlays become trays. */
export function setPhoneWidth() {
  act(() => window.happyDOM.setViewport({ width: 390, height: 844 }));
}

/** Lets React Aria's timers and transitions settle. */
export async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * Stands in for what happy-dom lacks and Slide uses to measure its figures: a 2D canvas
 * (text measured as 0.6 of its size per character) and font loading (ready at once).
 * `vi.restoreAllMocks()` undoes the canvas; the stand-in `document.fonts` stays, where
 * happy-dom has none to put back.
 */
export function mockTextMeasure() {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      ready: Promise.resolve(),
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const context = {
      font: "",
      measureText: (text: string) => ({
        width:
          text.length *
          0.6 *
          Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(context.font)?.[1] ?? "0"),
      }),
    };
    return context as unknown as CanvasRenderingContext2D;
  });
}
