import type { AppConfig } from "./config";
import type { Db } from "./lib/db";
import type { Logger } from "./lib/logger";
import type { Mailer } from "./mail/mailer";

/** What every route plugin receives; tests build one with their own database and mailer. */
export interface AppContext {
  db: Db;
  config: AppConfig;
  mailer: Mailer;
  logger: Logger;
  now: () => Date;
}
