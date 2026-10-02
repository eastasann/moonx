import { RouterProvider, ToastRegion } from "@moonx/ui-web";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ThemeSync } from "../components/ThemeSync";
import { overlaySearchSchema } from "../lib/overlay";
import { toasts } from "../lib/toast";
import type { RouterContext } from "../router";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "moonx" },
    ],
  }),
  validateSearch: overlaySearchSchema,
  shellComponent: RootDocument,
  component: Root,
});

function Root() {
  const router = useRouter();
  const { t } = useTranslation("app");
  return (
    <RouterProvider
      navigate={(href) => router.history.push(href)}
      useHref={(href) => router.history.createHref(href)}
    >
      <ThemeSync />
      <Outlet />
      <ToastRegion queue={toasts} label={t("toasts")} closeLabel={t("close")} />
    </RouterProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
