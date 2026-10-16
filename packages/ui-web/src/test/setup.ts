import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

declare global {
  interface Window {
    happyDOM: { setViewport(size: { width: number; height: number }): void };
  }
}

afterEach(() => {
  cleanup();
  window.happyDOM.setViewport({ width: 1024, height: 768 });
});
