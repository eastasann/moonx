import { i18n } from "@moonx/i18n";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* The screens and the parts take their words from the shared catalogs (ADR-026). */}
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
        <Scripts />
      </body>
    </html>
  );
}
