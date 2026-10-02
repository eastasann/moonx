import { createApp } from "./app";

const app = createApp({
  env: process.env.APP_ENV ?? "local",
  version: process.env.APP_VERSION ?? "dev",
});

app.listen(Number(process.env.PORT || 3000));
console.log(`api listening on ${app.server?.url}`);
