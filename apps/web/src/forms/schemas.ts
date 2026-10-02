import {
  createIdeaBodySchema,
  currencySchema,
  displayNameSchema,
  PASSWORD_MAX_LENGTH,
  passwordSchema,
  workspaceNameSchema,
} from "@moonx/schemas";
import { z } from "zod";
import { catalogMessage } from "../lib/form";

const email = z.string().trim().min(1).pipe(z.email());

const mismatch = {
  path: ["confirmPassword"],
  message: catalogMessage("app:form.passwordMismatch"),
};

/** Screen 2, log in. Any non-empty password is sent; the server decides. */
export const loginSchema = z.object({ email, password: z.string().min(1) });

/** Screen 2, send the password reset link. */
export const forgotPasswordSchema = z.object({ email });

/** Screen 2, choose a new password from the emailed link; screen 4, set one for a Google account. */
export const newPasswordSchema = z
  .object({ newPassword: passwordSchema, confirmPassword: z.string() })
  .refine((value) => value.newPassword === value.confirmPassword, mismatch);

/** Screen 2, sign up from an invitation. The email is fixed by the invitation, so it is not a field. */
export const signUpSchema = z.object({ displayName: displayNameSchema, password: passwordSchema });

/** Screen 3 step 2: name and time zone. */
export const profileSchema = z.object({
  displayName: displayNameSchema,
  timezone: z.string().min(1),
});

/** Screen 4, change the password. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, mismatch);

/** M7, create a workspace. */
export const createWorkspaceSchema = z.object({
  name: workspaceNameSchema,
  currency: currencySchema,
});

/** Screen 4, delete the account. The password is asked only of people who have one. */
export const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().min(1),
  password: z.string().max(PASSWORD_MAX_LENGTH),
});

/** M1, a new idea: the name and concept are required, the proposed solution is optional. */
export const newIdeaSchema = createIdeaBodySchema;
