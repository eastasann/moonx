import type { Auth } from "./auth";
import type { AppConfig } from "./config";
import type { AvatarStore } from "./lib/avatar-store";
import type { Db } from "./lib/db";
import type { Logger } from "./lib/logger";
import type { Mailer } from "./mail/mailer";

/** What every route plugin receives; tests build one with their own database and mailer. */
export interface AppContext {
  db: Db;
  config: AppConfig;
  mailer: Mailer;
  auth: Auth;
  avatars: AvatarStore;
  logger: Logger;
  now: () => Date;
}
