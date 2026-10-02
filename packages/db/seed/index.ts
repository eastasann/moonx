import { createDb } from "../src/client";
import { assertLocalDatabase } from "./guard";
import { DEMO_INVITE_TOKENS, DEMO_PASSWORD, people, seedDemo } from "./run";

if (process.env.APP_ENV !== "local") {
  console.error(
    `db-seed replaces every table with demo data and only runs when APP_ENV=local (got "${process.env.APP_ENV ?? ""}")`,
  );
  process.exit(2);
}

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_DIRECT or DATABASE_URL is required");
  process.exit(2);
}

try {
  assertLocalDatabase(url);
} catch (error) {
  console.error((error as Error).message);
  process.exit(2);
}

const { db, client } = createDb(url, { max: 1, quiet: true });
try {
  const { counts } = await seedDemo(db);
  const rows = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`seeded ${rows} rows into ${Object.keys(counts).length} tables`);
  console.log(
    `demo sign-in: ${Object.values(people)
      .map((p) => p.email)
      .join(", ")}`,
  );
  console.log(`password: ${DEMO_PASSWORD}`);
  console.log(
    `invitation tokens: pending=${DEMO_INVITE_TOKENS.pending} expired=${DEMO_INVITE_TOKENS.expired}`,
  );
} finally {
  await client.end();
}
