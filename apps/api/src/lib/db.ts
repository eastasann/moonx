import type { Db } from "@moonx/db";

export type { Db };
/** A drizzle transaction handle: what `db.transaction` passes in. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either, for helpers that read inside or outside a transaction. */
export type Executor = Db | Tx;
