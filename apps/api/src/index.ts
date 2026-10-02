import { createDb } from "@moonx/db";
import { createApp } from "./app";
import { loadConfig, MAX_BODY_BYTES } from "./config";
import { initSentry } from "./observability";

const config = loadConfig();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

initSentry(config);
const { db } = createDb(databaseUrl);
const app = createApp(config, { db });

app.listen({ port: Number(process.env.PORT || 3000), maxRequestBodySize: MAX_BODY_BYTES });
console.log(`api listening on ${app.server?.url}`);
