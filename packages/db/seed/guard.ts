const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Refuses a database that is not on this machine. `db-seed` empties every table, and `APP_ENV` is
 * only a label in `.env`: a developer who points `DATABASE_URL` at a shared database while keeping
 * `APP_ENV=local` must not lose it.
 */
export function assertLocalDatabase(url: string): void {
  const { hostname } = new URL(url);
  if (!LOOPBACK.has(hostname)) {
    throw new Error(
      `refusing to seed "${hostname}": db-seed only runs against a database on this machine`,
    );
  }
}
