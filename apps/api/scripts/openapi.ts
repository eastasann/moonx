import { fileURLToPath } from "node:url";
import { createApp } from "../src/app";
import { testConfig } from "../src/config";

/**
 * Writes the OpenAPI document of the routes to `apps/api/openapi.json` (`make openapi`). Building
 * the document does not call a handler, so no database is needed.
 */
const app = createApp(testConfig({ env: "openapi", openapi: true, version: "v1" }), {
  db: null as never,
});
const response = await app.handle(new Request("http://localhost/api/docs/json"));
if (!response.ok) throw new Error(`OpenAPI export failed with ${response.status}`);
const document = await response.json();
const target = fileURLToPath(new URL("../openapi.json", import.meta.url));
await Bun.write(target, `${JSON.stringify(document, null, 2)}\n`);
console.log(`wrote ${target}`);
