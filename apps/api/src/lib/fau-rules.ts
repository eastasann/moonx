import { type Confidence, confidenceSchema, type Fau, fauSchema } from "@moonx/schemas";
import { z } from "zod";
import { ApiError } from "../errors";

/**
 * `classification` in a request body (V3, V14, V16). Unlike the shared form schema, a missing
 * confidence is not a generic validation failure: the API answers 422 CONFIDENCE_REQUIRED.
 */
export const classificationBodySchema = z.object({
  fau: fauSchema.nullable(),
  confidence: confidenceSchema.nullish(),
});

/** The `classification` field of a request body. */
export type ClassificationBody = z.infer<typeof classificationBodySchema>;

/** What `applyClassification` needs to know about the item and the request. */
export interface FauChangeInput {
  current: { fau: Fau | null; confidence: Confidence | null };
  /** Whether the item has a value after this change (text typed, number set). */
  hasValue: boolean;
  /** The `classification` of the request, undefined when it was not sent. */
  input: ClassificationBody | undefined;
  /** Evidence links of the item that do not point at a deleted research log. */
  activeEvidenceCount: number;
}

/** The classification to store and whether the caller must clear the item's value. */
export interface FauChange {
  fau: Fau | null;
  confidence: Confidence | null;
  /** A number marked Unknown holds no value (design-spec 6.0.3): the caller clears it. */
  clearValue: boolean;
}

/**
 * Applies the F/A/U rules of design-spec 6.0.3 to one item.
 *
 * - Fact needs a value and at least one active evidence link (422 FACT_REQUIRES_EVIDENCE). An item
 *   that is already Fact stays Fact while its text changes, even if its evidence was deleted: that
 *   is the "Fact · No evidence" state, which only a research-log deletion creates.
 * - Assumption needs a confidence (422 CONFIDENCE_REQUIRED); the other states take none.
 * - Without a value only Unknown survives; the classification is dropped otherwise.
 * - Unknown on a number clears the value (`clearValue`).
 *
 * `numeric` says the item is a number (economics input, cost amount), as opposed to text.
 */
export function applyClassification(change: FauChangeInput, numeric: boolean): FauChange {
  const { current, input } = change;
  let fau: Fau | null;
  let confidence: Confidence | null;
  if (input === undefined) {
    fau = current.fau;
    confidence = current.confidence;
  } else {
    fau = input.fau;
    confidence = input.confidence ?? null;
    if (fau === "assumption" && confidence == null) {
      throw new ApiError("CONFIDENCE_REQUIRED", "An Assumption needs a confidence");
    }
    if (fau !== "assumption" && confidence != null) {
      throw new ApiError("VALIDATION_FAILED", "classification.confidence: only for Assumption", {
        details: [
          {
            path: "classification.confidence",
            code: "invalid_value",
            message: "Confidence applies to Assumption only",
          },
        ],
      });
    }
    if (fau === "fact" && current.fau !== "fact") {
      if (!change.hasValue || change.activeEvidenceCount === 0) {
        throw new ApiError("FACT_REQUIRES_EVIDENCE", "A Fact needs evidence");
      }
    }
  }
  if (fau === "unknown") {
    return { fau, confidence: null, clearValue: numeric };
  }
  if (!change.hasValue) return { fau: null, confidence: null, clearValue: false };
  return { fau, confidence: fau === "assumption" ? confidence : null, clearValue: false };
}
