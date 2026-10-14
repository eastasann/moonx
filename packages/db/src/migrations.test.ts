import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SQL as BunSQL } from "bun";
import { is, SQL } from "drizzle-orm";
import { toSnakeCase } from "drizzle-orm/casing";
import {
  getTableConfig,
  type IndexedColumn,
  isPgEnum,
  type PgColumn,
  PgDialect,
  PgTable,
} from "drizzle-orm/pg-core";
import { migrationsFolder } from "./migrate";
import * as schema from "./schema";

// make test-api prepares DATABASE_URL_TEST with every migration before the tests run.
// The expected side is built from schema.ts as temporary tables in the same database, so
// PostgreSQL renders both sides and they can be compared exactly.
const url = process.env.DATABASE_URL_TEST;
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL_TEST is required for make test-api");
}
const db = new BunSQL(url);
afterAll(() => db.close());

const MAX_IDENTIFIER_BYTES = 63;
const dialect = new PgDialect({ casing: "snake_case" });

/** A table as PostgreSQL renders it. */
interface TableShape {
  columns: Record<
    string,
    { type: string; notNull: boolean; default: string | null }
  >;
  /** Name → pg_get_constraintdef(): primary key, unique, foreign key and check. */
  constraints: Record<string, string>;
  /** Name → pg_get_indexdef() without the schema, for indexes no constraint owns. */
  indexes: Record<string, string>;
}

/** Every table of one schema (namespace oid), as PostgreSQL renders it. */
async function readShapes(
  sql: BunSQL,
  namespace: string,
): Promise<Record<string, TableShape>> {
  const shapes: Record<string, TableShape> = {};
  const shapeOf = (table: string) => {
    shapes[table] ??= { columns: {}, constraints: {}, indexes: {} };
    return shapes[table];
  };
  const columns = await sql`
    SELECT c.relname AS table, a.attname AS column,
      format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
      pg_get_expr(d.adbin, d.adrelid) AS default
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE c.relnamespace = ${namespace}::oid AND c.relkind = 'r'
      AND a.attnum > 0 AND NOT a.attisdropped`;
  for (const row of columns) {
    shapeOf(row.table).columns[row.column] = {
      type: row.type,
      notNull: row.not_null,
      default: row.default,
    };
  }
  const constraints = await sql`
    SELECT c.relname AS table, co.conname AS name, pg_get_constraintdef(co.oid) AS definition
    FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    WHERE c.relnamespace = ${namespace}::oid AND co.contype IN ('p', 'u', 'f', 'c')`;
  for (const row of constraints) {
    shapeOf(row.table).constraints[row.name] = row.definition;
  }
  const indexes = await sql`
    SELECT t.relname AS table, i.relname AS name, pg_get_indexdef(ix.indexrelid) AS definition
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    WHERE t.relnamespace = ${namespace}::oid AND NOT EXISTS (
      SELECT 1 FROM pg_constraint co
      WHERE co.conindid = ix.indexrelid AND co.contype IN ('p', 'u', 'x'))`;
  for (const row of indexes) {
    shapeOf(row.table).indexes[row.name] = String(row.definition).replace(
      / ON [^\s.]+\./,
      " ON ",
    );
  }
  return shapes;
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
function columnName(column: { name: string | undefined; keyAsName: boolean }) {
  if (column.name === undefined) throw new Error("column without a name");
  return column.keyAsName ? toSnakeCase(column.name) : column.name;
}

/** An SQL fragment of schema.ts as plain SQL, with its table's name left off columns. */
function render(value: SQL, table: string): string {
  const { sql, params } = dialect.sqlToQuery(value);
  if (params.length > 0) {
    throw new Error(`expression with parameters on ${table}: ${sql}`);
  }
  return sql.replaceAll(`${quote(table)}.`, "");
}

function defaultClause(column: PgColumn, table: string): string {
  if (!column.hasDefault) return "";
  const value: unknown = column.default;
  if (is(value, SQL)) return ` DEFAULT ${render(value, table)}`;
  if (typeof value === "string") {
    return ` DEFAULT '${value.replaceAll("'", "''")}'`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return ` DEFAULT ${value}`;
  }
  throw new Error(`default not modelled on ${table}.${column.name}`);
}

function indexKey(key: IndexedColumn | SQL, table: string): string {
  if (is(key, SQL)) return `(${render(key, table)})`;
  const { order, nulls, opClass } = key.indexConfig ?? {};
  return [
    quote(columnName(key)),
    opClass,
    order?.toUpperCase(),
    nulls === undefined ? undefined : `NULLS ${nulls.toUpperCase()}`,
  ]
    .filter((part) => part !== undefined)
    .join(" ");
}

/**
 * DDL that builds every table of schema.ts as a temporary table: columns, defaults,
 * constraints and indexes, named the way drizzle-kit names what schema.ts leaves unnamed.
 */
function expectedDdl(): { statements: string[]; names: string[] } {
  const tables = Object.values(schema).filter((value) => is(value, PgTable));
  const creates: string[] = [];
  const foreignKeys: string[] = [];
  const indexes: string[] = [];
  const names: string[] = [];
  for (const table of tables) {
    const config = getTableConfig(table);
    const name = config.name;
    const parts = config.columns.map(
      (column) =>
        `${quote(columnName(column))} ${column.getSQLType()}${column.notNull ? " NOT NULL" : ""}${defaultClause(column, name)}`,
    );
    const primaryKey = config.columns.filter((c) => c.primary).map(columnName);
    names.push(`${name}_pkey`);
    parts.push(
      `CONSTRAINT ${quote(`${name}_pkey`)} PRIMARY KEY (${primaryKey.map(quote).join(", ")})`,
    );
    for (const column of config.columns) {
      if (!column.isUnique || column.uniqueName === undefined) continue;
      names.push(column.uniqueName);
      parts.push(
        `CONSTRAINT ${quote(column.uniqueName)} UNIQUE${column.uniqueType === "not distinct" ? " NULLS NOT DISTINCT" : ""} (${quote(columnName(column))})`,
      );
    }
    for (const unique of config.uniqueConstraints) {
      // Built constraints always have a name (drizzle-orm generates one when unnamed);
      // the optional type comes from the builder.
      const uniqueName = unique.getName() as string;
      names.push(uniqueName);
      parts.push(
        `CONSTRAINT ${quote(uniqueName)} UNIQUE${unique.nullsNotDistinct ? " NULLS NOT DISTINCT" : ""} (${unique.columns.map((c) => quote(columnName(c))).join(", ")})`,
      );
    }
    for (const check of config.checks) {
      names.push(check.name);
      parts.push(
        `CONSTRAINT ${quote(check.name)} CHECK (${render(check.value, name)})`,
      );
    }
    creates.push(
      `CREATE TEMP TABLE ${quote(name)} (${parts.join(", ")}) ON COMMIT DROP`,
    );

    for (const foreignKey of config.foreignKeys) {
      const reference = foreignKey.reference();
      const columns = reference.columns.map(columnName);
      const referenced = getTableConfig(reference.foreignTable).name;
      const referencedColumns = reference.foreignColumns.map(columnName);
      const fkName =
        reference.name ??
        `${name}_${columns.join("_")}_${referenced}_${referencedColumns.join("_")}_fk`;
      names.push(fkName);
      foreignKeys.push(
        `ALTER TABLE pg_temp.${quote(name)} ADD CONSTRAINT ${quote(fkName)} FOREIGN KEY (${columns.map(quote).join(", ")}) REFERENCES pg_temp.${quote(referenced)} (${referencedColumns.map(quote).join(", ")}) ON DELETE ${foreignKey.onDelete ?? "no action"} ON UPDATE ${foreignKey.onUpdate ?? "no action"}`,
      );
    }
    for (const index of config.indexes) {
      const { columns, unique, where, method, with: options } = index.config;
      if (options !== undefined && Object.keys(options).length > 0) {
        throw new Error(`index options not modelled on ${name}`);
      }
      const keys = columns.map((key) =>
        indexKey(key as IndexedColumn | SQL, name),
      );
      const indexName =
        index.config.name ??
        `${name}_${columns.map((key) => columnName(key as IndexedColumn)).join("_")}_index`;
      names.push(indexName);
      indexes.push(
        `CREATE ${unique ? "UNIQUE " : ""}INDEX ${quote(indexName)} ON pg_temp.${quote(name)} USING ${method ?? "btree"} (${keys.join(", ")})${where === undefined ? "" : ` WHERE ${render(where, name)}`}`,
      );
    }
  }
  return { statements: [...creates, ...foreignKeys, ...indexes], names };
}

describe("the migrations", () => {
  test("build every table, column, constraint and index of schema.ts", async () => {
    const [{ oid: publicSchema }] =
      await db`SELECT 'public'::regnamespace::oid::text AS oid`;
    // Read before the temporary tables exist: they would shadow the real ones and make
    // PostgreSQL schema-qualify the tables that foreign keys reference.
    const actual = await readShapes(db, publicSchema);
    const expected = await db.begin(async (tx) => {
      for (const statement of expectedDdl().statements) {
        await tx.unsafe(statement);
      }
      const [{ oid: tempSchema }] =
        await tx`SELECT pg_my_temp_schema()::text AS oid`;
      return readShapes(tx, tempSchema);
    });
    expect(actual).toEqual(expected);
  });

  test("create every enum of schema.ts with its values in order", async () => {
    const expected = Object.fromEntries(
      Object.values(schema).flatMap((value) =>
        isPgEnum(value) ? [[value.enumName, [...value.enumValues]]] : [],
      ),
    );
    const rows = await db`
      SELECT t.typname AS name, jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typnamespace = 'public'::regnamespace
      GROUP BY t.typname`;
    expect(
      Object.fromEntries(
        rows.map((row: { name: string; labels: string[] }) => [
          row.name,
          row.labels,
        ]),
      ),
    ).toEqual(expected);
  });

  test("record every migration of the journal as applied", async () => {
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
    ) as { entries: { when: number }[] };
    const rows =
      await db`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
    expect(
      rows.map((row: { created_at: string }) => Number(row.created_at)),
    ).toEqual(journal.entries.map((entry) => entry.when));
  });
});

describe("schema.ts", () => {
  // A longer name would be cut short by PostgreSQL and stop matching drizzle-kit's
  // snapshot; the comparison above would then fail with a less direct message.
  test("names every constraint and index within PostgreSQL's 63 bytes", () => {
    expect(
      expectedDdl().names.filter(
        (name) => Buffer.byteLength(name) > MAX_IDENTIFIER_BYTES,
      ),
    ).toEqual([]);
  });
});
