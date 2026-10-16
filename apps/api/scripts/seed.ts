// make db-seed. Demo data only ever goes into a local database (SDD 2章「make ターゲット」);
// templates reach staging and production through the operator's import instead. It runs
// here rather than in packages/db because publishing the plan template checks its Pitch
// Deck in the PDF's fonts, which the API loads (AD6, ADR-012).

import { connectDatabase } from "@moonx/db";
import { seedDatabase } from "@moonx/db/seed";
import { loadPitchFonts } from "../src/pitch-fonts";

const appEnv = process.env.APP_ENV?.trim();
if (appEnv !== "local") {
  console.error(
    `make db-seed runs only with APP_ENV=local (got ${appEnv ? `"${appEnv}"` : "nothing"})`,
  );
  process.exit(1);
}
const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set (copy it from .env.example)");
  process.exit(1);
}
const { db, close } = connectDatabase(url);
try {
  await seedDatabase(db, { measure: await loadPitchFonts() });
  console.log("Seeded the demo data of design-spec 8");
} finally {
  await close();
}
