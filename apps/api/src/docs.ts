import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import swaggerUiCss from "swagger-ui-dist/swagger-ui.css" with { type: "text" };
import swaggerUiBundle from "swagger-ui-dist/swagger-ui-bundle.js" with {
  type: "text",
};
import { z } from "zod";

/** Where the OpenAPI document is served on staging; `make openapi` reads it from here. */
export const OPENAPI_JSON_PATH = "/api/docs/json";

// The CSP of SDD 7.2 allows scripts from this origin only, so the plugin's own pages,
// which load Swagger UI or Scalar from a CDN and start them with an inline script, would
// stay blank. The page below loads the bundled Swagger UI and a separate start script.
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>moonx API</title>
    <link rel="stylesheet" href="/api/docs/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs/swagger-ui-bundle.js"></script>
    <script src="/api/docs/start.js"></script>
  </body>
</html>
`;

const START = `window.ui = SwaggerUIBundle(${JSON.stringify({
  url: OPENAPI_JSON_PATH,
  dom_id: "#swagger-ui",
})});
`;

const asset = (body: string, contentType: string) => () =>
  new Response(body, { headers: { "content-type": contentType } });

const hidden = { detail: { hide: true } };

/**
 * `/api/docs` (ADR-006): the OpenAPI document of every route and a Swagger UI page to
 * read it. Only staging installs it.
 */
export function docsRoutes() {
  return new Elysia()
    .use(
      openapi({
        path: "/api/docs",
        specPath: OPENAPI_JSON_PATH,
        provider: null,
        documentation: {
          info: {
            title: "moonx API",
            description:
              "The REST API of moonx (docs/02-01_system-design-doc.md 5章).",
            version: "v1",
          },
        },
        mapJsonSchema: { zod: z.toJSONSchema },
      }),
    )
    .get("/api/docs", asset(PAGE, "text/html; charset=utf-8"), hidden)
    .get(
      "/api/docs/swagger-ui.css",
      asset(swaggerUiCss, "text/css; charset=utf-8"),
      hidden,
    )
    .get(
      "/api/docs/swagger-ui-bundle.js",
      asset(swaggerUiBundle, "text/javascript; charset=utf-8"),
      hidden,
    )
    .get(
      "/api/docs/start.js",
      asset(START, "text/javascript; charset=utf-8"),
      hidden,
    );
}
