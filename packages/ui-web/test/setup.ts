import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { defaultMatchMedia, restoreMatchMedia } from "./matchMedia";

afterEach(() => {
  cleanup();
  restoreMatchMedia();
});

window.matchMedia = defaultMatchMedia;
