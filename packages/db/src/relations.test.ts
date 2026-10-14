import { afterAll, describe, expect, test } from "bun:test";
import {
  type Column,
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  getTableName,
  is,
  Many,
  normalizeRelation,
  One,
} from "drizzle-orm";
import { toCamelCase, toSnakeCase } from "drizzle-orm/casing";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { connectDatabase, fullSchema } from "./client";
import * as schema from "./schema";

const { tables, tableNamesMap } = extractTablesRelationalConfig(
  fullSchema,
  createTableRelationsHelpers,
);
const columnRef = (column: Column) =>
  `${getTableName(column.table)}.${column.name}`;

/** Every relation, resolved to the columns it joins the way relational queries do. */
function resolvedRelations() {
  return Object.values(tables).flatMap((table) =>
    Object.values(table.relations).map((relation) => {
      const { fields, references } = normalizeRelation(
        tables,
        tableNamesMap,
        relation,
      );
      return {
        holdsKey: is(relation, One) && relation.config !== undefined,
        link: `${fields.map(columnRef).join(",")} -> ${references.map(columnRef).join(",")}`,
      };
    }),
  );
}

describe("relations", () => {
  test("pair with the foreign keys of schema.ts, one relation each way", () => {
    const keys = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .flatMap((table) =>
        getTableConfig(table).foreignKeys.map((foreignKey) => {
          const reference = foreignKey.reference();
          return {
            from: reference.columns.map(columnRef).join(","),
            to: reference.foreignColumns.map(columnRef).join(","),
          };
        }),
      );
    const relations = resolvedRelations();

    expect(
      relations
        .filter((r) => r.holdsKey)
        .map((r) => r.link)
        .sort(),
    ).toEqual(keys.map((key) => `${key.from} -> ${key.to}`).sort());
    expect(
      relations
        .filter((r) => !r.holdsKey)
        .map((r) => r.link)
        .sort(),
    ).toEqual(keys.map((key) => `${key.to} -> ${key.from}`).sort());
  });

  // The naming rule at the top of relations.ts. Checking names, not only links, catches
  // two relations of one table that point at each other's key.
  test("are named after their foreign key", () => {
    const plural = (word: string) =>
      word.endsWith("y")
        ? `${word.slice(0, -1)}ies`
        : word.endsWith("sis")
          ? `${word.slice(0, -3)}ses`
          : `${word}s`;
    const singular = (word: string) =>
      word.endsWith("ies")
        ? `${word.slice(0, -3)}y`
        : word.endsWith("ses")
          ? `${word.slice(0, -3)}sis`
          : word.slice(0, -1);
    const problems: string[] = [];
    for (const table of Object.values(schema).filter((value) =>
      is(value, PgTable),
    )) {
      const config = getTableConfig(table);
      const holding = tableNamesMap[`public.${config.name}`] ?? config.name;
      for (const foreignKey of config.foreignKeys) {
        const reference = foreignKey.reference();
        const key = reference.columns[0]?.name ?? "";
        const column = config.columns.find((c) => c.name === key);
        const referencedName = getTableName(reference.foreignTable);
        const referenced =
          tableNamesMap[`public.${referencedName}`] ?? referencedName;
        const role = key.replace(/Id$/, "");
        const relationName = `${config.name}_${toSnakeCase(key)}`;
        const label = `${holding}.${key}`;

        const forward = tables[holding]?.relations[role];
        if (
          !is(forward, One) ||
          forward.config?.fields[0]?.name !== key ||
          forward.relationName !== relationName
        ) {
          problems.push(
            `${label}: no one() named ${role} with ${relationName}`,
          );
        }

        const inverses = Object.entries(
          tables[referenced]?.relations ?? {},
        ).filter(([, relation]) =>
          column?.isUnique
            ? is(relation, One) &&
              relation.config === undefined &&
              relation.referencedTable === table
            : relation.relationName === relationName && relation !== forward,
        );
        const expected = column?.isUnique
          ? [toCamelCase(singular(config.name))]
          : [
              plural(toSnakeCase(role)) === referencedName
                ? holding
                : `${holding}As${role[0]?.toUpperCase()}${role.slice(1)}`,
            ];
        const kindOk = inverses.every(([, relation]) =>
          column?.isUnique ? is(relation, One) : is(relation, Many),
        );
        if (
          !kindOk ||
          JSON.stringify(inverses.map(([name]) => name)) !==
            JSON.stringify(expected)
        ) {
          problems.push(
            `${label}: inverse on ${referenced} should be ${column?.isUnique ? "one()" : "many()"} ${expected[0]}, found ${inverses.map(([name]) => name).join(", ") || "none"}`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  describe("through connectDatabase", () => {
    const url = process.env.DATABASE_URL_TEST;
    if (url === undefined || url === "") {
      throw new Error("DATABASE_URL_TEST is required for make test-api");
    }
    const { db, close } = connectDatabase(url);
    afterAll(close);

    test("load every relation of every table", async () => {
      const failures: string[] = [];
      for (const table of Object.values(tables)) {
        // Typed per table, which a loop over every table cannot name.
        const query = db.query[
          table.tsName as keyof typeof db.query
        ] as unknown as {
          findFirst: (config: {
            with: Record<string, true>;
          }) => Promise<unknown>;
        };
        const withAll = Object.fromEntries(
          Object.keys(table.relations).map((name) => [name, true] as const),
        );
        try {
          await query.findFirst({ with: withAll });
        } catch (error) {
          failures.push(`${table.tsName}: ${error}`);
        }
      }
      expect(failures).toEqual([]);
    });
  });
});
