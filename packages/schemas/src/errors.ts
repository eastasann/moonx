import { z } from "zod";

/**
 * Every error code of SDD 8.1 with the HTTP status the API answers it with. The client
 * picks its wording by code (catalog key `errors:<CODE>`), never from `message`.
 *
 * INVITATION_REQUIRED and ACCOUNT_SUSPENDED come from the Better Auth hooks in Better
 * Auth's own `{ code, message }` shape. UPSTREAM_UNAVAILABLE is what the API answers
 * itself (503); the client also maps a bare 502, 503 or 504 from Cloud Run's front to it.
 */
export const errorStatus = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NO_ACCESS: 403,
  INVITATION_EMAIL_MISMATCH: 403,
  INVALID_PASSWORD: 403,
  REAUTH_REQUIRED: 403,
  NOT_SHARED: 403,
  INVITATION_REQUIRED: 403,
  ACCOUNT_SUSPENDED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CONFLICT_MULTI: 409,
  ALREADY_REVERTED: 409,
  UNDO_BLOCKED: 409,
  BUSY: 409,
  TEMPLATE_NOT_PUBLISHED: 409,
  ARCHIVED: 409,
  LAST_OWNER: 409,
  CANNOT_LEAVE_PERSONAL: 409,
  PERSONAL_OWNER: 409,
  ALREADY_MEMBER: 409,
  INVITATION_PENDING: 409,
  INVITATION_ALREADY_ACCEPTED: 409,
  EMAIL_TAKEN: 409,
  PASSWORD_ALREADY_SET: 409,
  DECISION_CHANGED: 409,
  DECISION_NOT_PROCEED: 409,
  NAME_TAKEN: 409,
  HAS_EMPTY_QUESTIONS: 409,
  ALREADY_LATEST: 409,
  DRAFT_EXISTS: 409,
  PUBLISHED_READ_ONLY: 409,
  INVITATION_INVALID: 410,
  PAYLOAD_TOO_LARGE: 413,
  VALIDATION_FAILED: 422,
  FACT_REQUIRES_EVIDENCE: 422,
  CONFIDENCE_REQUIRED: 422,
  INVALID_CHOICE: 422,
  QUESTION_NOT_FOUND: 422,
  PERCENT_ONLY_FOR_VARIABLE: 422,
  OUT_OF_RANGE: 422,
  NOT_EDITABLE: 422,
  INVALID_ASSIGNEE: 422,
  INVALID_STATUS: 422,
  MUST_BE_DONE_TO_SHARE: 422,
  NOT_SHAREABLE: 422,
  EMPTY_SCOPE: 422,
  NOT_IMPORTABLE: 422,
  REPLY_DEPTH: 422,
  INVALID_MENTION: 422,
  INVALID_QUESTION_KEY: 422,
  TEMPLATE_INVALID: 422,
  CANNOT_SUSPEND_SELF: 422,
  CONFIRMATION_MISMATCH: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  UPSTREAM_UNAVAILABLE: 503,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof errorStatus;

export const errorCodes = Object.keys(errorStatus) as ErrorCode[];

export const errorCodeSchema = z.enum(
  errorCodes as [ErrorCode, ...ErrorCode[]],
);

/** One failed input of VALIDATION_FAILED and OUT_OF_RANGE. The input value is never echoed. */
export const errorDetailSchema = z.object({
  path: z.string(),
  /** The Zod issue code, such as `too_small`. */
  code: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

/** The `details` for failed Zod issues, the path joined with dots (`sections.0.title`). */
export const issueDetails = (
  issues: readonly z.core.$ZodIssue[],
): ErrorDetail[] =>
  issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code,
    message: issue.message,
  }));

/**
 * The body of every `/api/v1` error (SDD 8.1). Codes add their own fields (`current`,
 * `conflicts`, `latest`, `invitedEmail`, `emptyCount`, `workspaces`, `retryAfterSeconds`,
 * `invitationId`), which the endpoint schemas type; they pass through here.
 */
export const errorBodySchema = z.object({
  error: z.looseObject({
    code: errorCodeSchema,
    /** For developers, in English, as in the log. Not shown on screen. */
    message: z.string(),
    requestId: z.uuid(),
    details: z.array(errorDetailSchema).optional(),
  }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;
