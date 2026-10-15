// make admin-create EMAIL=...: issues the invitation that makes the first operator and
// prints its link (SDD 2章「make ターゲット」, ADR-010). It writes to DATABASE_URL and
// builds the link on BETTER_AUTH_URL; for staging or production both are overridden on
// the command line (03_dev-setup.md 5.4 K).

import { connectDatabase } from "@moonx/db";
import { emailSchema } from "@moonx/schemas";
import { issueAdminInvitation } from "../src/invitations";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [email] = process.argv.slice(2);
if (email === undefined || !emailSchema.safeParse(email).success) {
  fail("Usage: make admin-create EMAIL=<email address>");
}
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) fail("DATABASE_URL is required");
const baseUrl = process.env.BETTER_AUTH_URL?.trim();
if (!baseUrl || !URL.canParse(baseUrl)) {
  fail(
    "BETTER_AUTH_URL must be the URL of the site, such as https://stg.example.com",
  );
}

const { db, close } = connectDatabase(databaseUrl);
try {
  const { token, invitation } = await issueAdminInvitation(
    db,
    email,
    new Date(),
  );
  const link = new URL(`/invite/${token}`, baseUrl);
  console.log(
    `Operator invitation for ${invitation.email}, valid until ${invitation.expiresAt.toISOString()}:`,
  );
  console.log(link.href);
} finally {
  await close();
}
