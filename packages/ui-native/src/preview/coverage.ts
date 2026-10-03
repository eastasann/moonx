import { ACTIONS_COVERAGE } from "./ActionsSection";
import { APP_PARTS_COVERAGE } from "./AppPartsSection";
import { COLLECTIONS_COVERAGE } from "./CollectionsSection";
import { FEEDBACK_COVERAGE } from "./FeedbackSection";
import { FIELDS_COVERAGE } from "./FieldsSection";
import { LAYOUT_COVERAGE } from "./LayoutSection";
import { OVERLAYS_COVERAGE } from "./OverlaysSection";

/**
 * The names of the public parts the gallery sections render, directly or inside the part they
 * list under `includes`. The gallery test compares it with the exports of `src/index.ts`, so a
 * new part without a gallery entry fails the build.
 */
export const GALLERY_COVERAGE: readonly string[] = [
  ...ACTIONS_COVERAGE,
  ...FIELDS_COVERAGE,
  ...OVERLAYS_COVERAGE,
  ...FEEDBACK_COVERAGE,
  ...COLLECTIONS_COVERAGE,
  ...APP_PARTS_COVERAGE,
  ...LAYOUT_COVERAGE,
];
