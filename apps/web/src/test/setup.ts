import { i18n } from "@moonx/i18n";
import { cleanup } from "@testing-library/react";
import { setI18n } from "react-i18next";
import { afterEach } from "vitest";

// Screens and parts take their words from react-i18next (ADR-026). The root route hands it
// the shared instance through I18nextProvider; rendered alone here, they get it as the
// default.
setI18n(i18n);

afterEach(cleanup);
