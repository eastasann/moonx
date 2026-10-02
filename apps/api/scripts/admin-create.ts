import { createDb } from "@moonx/db";
import { AdminCreateError, createOperatorInvitation } from "../src/lib/admin-create";

/** `make admin-create EMAIL=...`: prints the link that registers the first operator. */
async function main() {
  const email = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL;
  if (!email) throw new AdminCreateError("Usage: bun run admin-create <email>");
  if (!databaseUrl) throw new AdminCreateError("DATABASE_URL is required");
  const publicUrl = (process.env.BETTER_AUTH_URL || "http://localhost:5173").replace(/\/+$/, "");
  const { db, client } = createDb(databaseUrl, { max: 1, quiet: true });
  try {
    const result = await createOperatorInvitation(db, { email, publicUrl, now: new Date() });
    console.log(
      `${result.reissued ? "Reissued" : "Issued"} an operator invitation for ${email} (valid until ${result.expiresAt}):`,
    );
    console.log(result.link);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof AdminCreateError ? error.message : error);
  process.exit(1);
});
