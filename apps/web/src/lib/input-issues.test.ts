import {
  currencySchema,
  dateInputSchema,
  emailSchema,
  moneySchema,
  numberTextSchema,
  operatingDaysSchema,
  passwordSchema,
  percentInputSchema,
  sellingPriceSchema,
  timeZoneSchema,
  urlSchema,
  workspaceNameSchema,
} from "@moonx/schemas";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { inputIssueMessage } from "./input-issues";

/** The message of the first issue `schema` finds in `value`. */
const messageOf = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  if (result.success) throw new Error(`${String(value)} passed`);
  const [issue] = result.error.issues;
  if (issue === undefined) throw new Error("no issue");
  return inputIssueMessage(issue);
};

describe("inputIssueMessage (SDD 9章「入力の検査の文言」)", () => {
  test("lengths, from design-spec 6.0.8's limits", () => {
    expect(messageOf(workspaceNameSchema, "x".repeat(61))).toBe(
      "Too long. Shorten to 60 characters.",
    );
    expect(messageOf(passwordSchema, "short")).toBe(
      "Use at least 8 characters",
    );
    expect(messageOf(z.string().max(20_000), "x".repeat(20_001))).toBe(
      "Too long. Shorten to 20,000 characters.",
    );
  });

  test("the rules of packages/schemas, by their params.rule", () => {
    expect(messageOf(workspaceNameSchema, "   ")).toBe("Can't be empty");
    expect(messageOf(workspaceNameSchema, "BC\u0000DX")).toBe(
      "Remove the character that can't be saved",
    );
    expect(messageOf(workspaceNameSchema, "BC\ud800DX")).toBe(
      "Remove the character that can't be saved",
    );
    expect(messageOf(currencySchema, "ZZZ")).toBe(
      "Choose a currency from the list",
    );
    expect(messageOf(timeZoneSchema, "+08:00")).toBe(
      "Choose a time zone from the list",
    );
  });

  test("numbers, in the unit typed (a % as 0 to 100)", () => {
    expect(messageOf(percentInputSchema, 120)).toBe("Enter 100 or less");
    expect(messageOf(moneySchema, -1)).toBe("Enter 0 or more");
    expect(messageOf(moneySchema, 1.234)).toBe("Use at most 2 decimal places");
    expect(messageOf(moneySchema, 2_000_000_000_000)).toBe(
      "Enter 1,000,000,000,000 or less",
    );
    expect(messageOf(sellingPriceSchema, 0)).toBe(
      "Enter a number greater than 0",
    );
    expect(messageOf(z.number().gt(5), 5)).toBe(
      "Enter a number greater than 5",
    );
    expect(messageOf(z.number().lt(5), 5)).toBe("Enter a number less than 5");
    expect(messageOf(operatingDaysSchema, 2.5)).toBe("Enter a whole number");
    expect(messageOf(numberTextSchema(moneySchema), "1,5")).toBe(
      "Enter a number such as 1,500.50",
    );
    expect(messageOf(z.number(), Number.NaN)).toBe("Enter a number");
  });

  test("formats and choices", () => {
    expect(messageOf(emailSchema, "ana@")).toBe("Enter an email address");
    expect(messageOf(urlSchema, "ftp://x.example")).toBe(
      "Enter a URL that starts with http:// or https://",
    );
    expect(messageOf(dateInputSchema, "2026-02-30")).toBe("Enter a date");
    expect(messageOf(z.iso.datetime(), "soon")).toBe("Enter a date and time");
    expect(messageOf(z.string().regex(/^V\./), "X")).toBe("Check the format");
    expect(messageOf(z.enum(["a", "b"]), "c")).toBe(
      "Choose one of the options",
    );
  });

  test("an issue no field raises fails loudly instead of showing nothing", () => {
    expect(() => messageOf(z.strictObject({}), { extra: 1 })).toThrow(
      /unrecognized_keys/,
    );
  });
});
