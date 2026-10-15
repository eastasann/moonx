import { openapi } from "@elysiajs/openapi";
import { errorBodySchema } from "@moonx/schemas";
import { Elysia } from "elysia";
import swaggerUiCss from "swagger-ui-dist/swagger-ui.css" with { type: "text" };
import swaggerUiBundle from "swagger-ui-dist/swagger-ui-bundle.js" with {
  type: "text",
};
import { z } from "zod";
import type { AccessPlugin } from "./access";

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
 * A schema as JSON Schema, on the side the API produces. A request schema that reads
 * what was sent into another value (a blank text into null, a query string into a
 * number) holds a transform, which JSON Schema cannot express on that side; the plugin
 * does not say which side it asks for, and only requests have transforms, so such a
 * schema is documented as it is sent.
 */
function toJsonSchema(schema: z.ZodType) {
  try {
    return z.toJSONSchema(schema);
  } catch {
    return z.toJSONSchema(schema, { io: "input" });
  }
}

/** A schema as a component, which takes no `$schema` of its own. */
function componentOf(schema: z.ZodType) {
  const { $schema: _, ...component } = toJsonSchema(schema);
  return component;
}

/**
 * `/api/docs` (ADR-006): the OpenAPI document of every route and a Swagger UI page to
 * read it. Only staging installs it, open to anyone there (SDD 7.1 Z3).
 */
export function docsRoutes(access: AccessPlugin) {
  // The guard declares every route below open, the plugin's document route included.
  // Its callback form would hide the app's routes from the plugin's document.
  return new Elysia()
    .use(access)
    .guard({ open: true })
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
          components: {
            // Zod writes JSON Schema draft 2020-12, which an OpenAPI 3.1 schema is;
            // the plugin's types spell `type` more narrowly than Zod's.
            schemas: { ErrorBody: componentOf(errorBodySchema) as never },
          },
        },
        mapJsonSchema: {
          // A 204 declares `z.undefined()`, which JSON Schema cannot express: it is
          // documented by its description alone. Every error shares one body (SDD 8.1),
          // written once: inline in each of them, it outgrew the size Biome checks.
          zod: (schema: z.ZodType) =>
            schema instanceof z.ZodUndefined
              ? { description: schema.description }
              : schema === errorBodySchema
                ? { $ref: "#/components/schemas/ErrorBody" }
                : toJsonSchema(schema),
        },
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
