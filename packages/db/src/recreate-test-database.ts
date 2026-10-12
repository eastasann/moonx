import { recreateTestDatabase, UnsafeTestDatabaseError } from "./test-database";

const url = process.env.DATABASE_URL_TEST;
if (url === undefined || url === "") {
  console.error("DATABASE_URL_TEST is not set (copy it from .env.example)");
  process.exit(1);
}
try {
  await recreateTestDatabase(url);
} catch (error) {
  if (!(error instanceof UnsafeTestDatabaseError)) throw error;
  console.error(`Refusing to recreate the test database: ${error.message}`);
  process.exit(1);
}
