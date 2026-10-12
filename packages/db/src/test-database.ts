import { SQL } from "bun";
import { migrateDatabase } from "./migrate";

/** Thrown when a URL is not safe to drop and recreate as a test database. */
export class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTestDatabaseError";
  }
}

// PostgreSQL silently truncates longer identifiers, quoted ones included, so a longer
// name ending in _test would drop a database whose real name does not.
const MAX_IDENTIFIER_BYTES = 63;

/**
 * Returns the database name of a test database URL, refusing any URL whose database
 * could hold real data (SDD 2章「環境変数」の DATABASE_URL_TEST): the name must end in
 * `_test`, and the URL must carry no query string, since parameters such as `options`
 * or `dbname` could point the connection at a different database than the path says.
 * The name must be plain ASCII without percent-escapes, so every client reads it alike.
 *
 * @throws {UnsafeTestDatabaseError} when the URL breaks a rule or cannot be read.
 */
export function testDatabaseName(url: string): string {
  if (url.includes("?")) {
    throw new UnsafeTestDatabaseError(
      "DATABASE_URL_TEST must not have a query string",
    );
  }
  let name: string;
  try {
    name = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new UnsafeTestDatabaseError("DATABASE_URL_TEST is not a valid URL");
  }
  // Bun SQL decodes percent-escapes in the path and postgres.js does not, so with an
  // encoded name the two would recreate and migrate different databases. The URL parser
  // encodes control and non-ASCII characters, so this also refuses those.
  if (name.includes("%")) {
    throw new UnsafeTestDatabaseError(
      "DATABASE_URL_TEST must name the database without percent-encoding",
    );
  }
  if (name.includes("/")) {
    throw new UnsafeTestDatabaseError(
      "DATABASE_URL_TEST must name a single database",
    );
  }
  if (new TextEncoder().encode(name).length > MAX_IDENTIFIER_BYTES) {
    throw new UnsafeTestDatabaseError(
      `DATABASE_URL_TEST must name a database of at most ${MAX_IDENTIFIER_BYTES} bytes`,
    );
  }
  if (!name.endsWith("_test")) {
    throw new UnsafeTestDatabaseError(
      `DATABASE_URL_TEST must name a database ending in _test, got "${name}"`,
    );
  }
  return name;
}

/**
 * Wraps a name in double quotes and doubles any quote inside, so PostgreSQL reads it as
 * one identifier, case kept. Length is not checked here: callers pass names that
 * {@link testDatabaseName} has already limited to 63 bytes.
 */
export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Drops and recreates the test database, disconnecting any session still using it.
 * Connects to the server's `postgres` database with the same credentials, so the role
 * needs CREATEDB (the local Docker and CI service-container roles are superusers).
 */
export async function recreateTestDatabase(url: string): Promise<void> {
  const name = quoteIdentifier(testDatabaseName(url));
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = new SQL(admin.toString());
  try {
    await sql.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await sql.unsafe(`CREATE DATABASE ${name}`);
  } finally {
    await sql.close();
  }
}

/**
 * Recreates the test database and applies every migration, so each run starts from an
 * empty database with the current schema.
 */
export async function prepareTestDatabase(url: string): Promise<void> {
  await recreateTestDatabase(url);
  await migrateDatabase(url);
}
