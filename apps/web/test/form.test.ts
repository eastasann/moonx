import { createI18n } from "@moonx/i18n";
import { expect, test } from "vitest";
import {
  changePasswordSchema,
  createWorkspaceSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  profileSchema,
  signUpSchema,
} from "../src/forms/schemas";
import { validate } from "../src/lib/form";
import { oauthErrorCode } from "../src/lib/oauth-error";

const t = createI18n().t;
const run = (schema: Parameters<typeof validate>[0], value: unknown) =>
  validate(schema, t)({ value });

test("a valid value passes", () => {
  expect(run(loginSchema, { email: " ana@example.com ", password: "x" })).toBeUndefined();
});

test("a blank required field says Required, and a bad address says so", () => {
  expect(run(loginSchema, { email: "", password: "" })).toEqual({
    fields: { email: "Required", password: "Required" },
  });
  expect(run(loginSchema, { email: "not-an-email", password: "x" })).toEqual({
    fields: { email: "Enter a valid email address" },
  });
  expect(run(forgotPasswordSchema, { email: "  " })).toEqual({ fields: { email: "Required" } });
});

test("the password rule has the API's limits, in catalog text", () => {
  expect(run(signUpSchema, { displayName: "Nina", password: "short" })).toEqual({
    fields: { password: "Enter at least 8 characters" },
  });
  expect(run(signUpSchema, { displayName: "Nina", password: "x".repeat(129) })).toEqual({
    fields: { password: "Use at most 128 characters" },
  });
  expect(run(signUpSchema, { displayName: "x".repeat(61), password: "long-enough" })).toEqual({
    fields: { displayName: "Use at most 60 characters" },
  });
});

test("a confirmation that differs is reported on the confirmation field", () => {
  expect(
    run(newPasswordSchema, { newPassword: "long-enough", confirmPassword: "other-one" }),
  ).toEqual({
    fields: { confirmPassword: "The passwords don't match" },
  });
  expect(
    run(newPasswordSchema, { newPassword: "long-enough", confirmPassword: "long-enough" }),
  ).toBeUndefined();
  expect(
    run(changePasswordSchema, {
      currentPassword: "",
      newPassword: "long-enough",
      confirmPassword: "x",
    }),
  ).toEqual({
    fields: { currentPassword: "Required", confirmPassword: "The passwords don't match" },
  });
});

test("only the first problem of a field is reported", () => {
  const result = run(newPasswordSchema, { newPassword: "", confirmPassword: "" }) as {
    fields: Record<string, string>;
  };
  expect(Object.keys(result.fields)).toEqual(["newPassword"]);
});

test("profile, workspace and deletion forms", () => {
  expect(run(profileSchema, { displayName: "  ", timezone: "Asia/Manila" })).toEqual({
    fields: { displayName: "Required" },
  });
  expect(run(createWorkspaceSchema, { name: "", currency: "PHP" })).toEqual({
    fields: { name: "Required" },
  });
  expect(run(createWorkspaceSchema, { name: "Team", currency: "peso" })).toEqual({
    fields: { currency: "Enter a valid value" },
  });
  expect(run(deleteAccountSchema, { confirmEmail: "", password: "" })).toEqual({
    fields: { confirmEmail: "Required" },
  });
});

test("Google sign-in errors map to the invitation and suspension texts", () => {
  expect(oauthErrorCode("signup_disabled")).toBe("INVITATION_REQUIRED");
  expect(oauthErrorCode("unable_to_create_user")).toBe("INVITATION_REQUIRED");
  expect(oauthErrorCode("ACCOUNT_SUSPENDED")).toBe("ACCOUNT_SUSPENDED");
  expect(oauthErrorCode("unable_to_create_session")).toBe("ACCOUNT_SUSPENDED");
  expect(oauthErrorCode("something_else")).toBe("INTERNAL");
});
