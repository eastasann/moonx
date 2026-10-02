/** Where the browser tests find their servers and database (see playwright.config.ts). */
export const DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgres://moonx:moonx@localhost:5432/moonx_test";
export const API_PORT = 3100;
export const WEB_PORT = 5273;
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
