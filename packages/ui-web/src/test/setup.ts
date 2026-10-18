import { i18n } from "@moonx/i18n";
import { cleanup } from "@testing-library/react";
import { setI18n } from "react-i18next";
import { afterEach } from "vitest";

// The parts take their words from react-i18next (ADR-026). The app's root hands it the
// shared instance through I18nextProvider; rendered alone here, they get it as the default.
setI18n(i18n);

declare global {
  interface Window {
    happyDOM: { setViewport(size: { width: number; height: number }): void };
  }
}

afterEach(() => {
  cleanup();
  window.happyDOM.setViewport({ width: 1024, height: 768 });
});
