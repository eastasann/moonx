import type { ReactNode } from "react";
import { useIsNarrow } from "../internal/useIsNarrow";
import { MainActionBar, PageHeader } from "./PageHeader";
import * as styles from "./patterns.css";

export interface PresentationPatternProps {
  /** The title. */
  header: ReactNode;
  /** The deck's tools beside the title: 1 min / 5 min, the version to show. */
  actions?: ReactNode;
  /** The main action ("Download PDF"): fixed to the bottom on a phone. */
  primaryAction?: ReactNode;
  /** Tablet and wider: the thumbnails, a CardView of small `Slide`s to pick from. */
  thumbnails: ReactNode;
  /** Tablet and wider: the chosen slide, wide. */
  slide: ReactNode;
  /** What to say (§30), under the slide; on a phone, under all the slides (6.14). */
  notes?: ReactNode;
  /** Phone: every slide at the width, one under another. */
  slides: ReactNode;
}

/**
 * Pattern I, presentation (design-spec 4.1): slides to show and export (23). Desktop and
 * tablet: the thumbnails on the left, the slide on the right with the notes under it.
 * Phone: the slides at the width, one under another, then the notes.
 */
export function PresentationPattern({
  header,
  actions,
  primaryAction,
  thumbnails,
  slide,
  notes,
  slides,
}: PresentationPatternProps) {
  const isNarrow = useIsNarrow();
  return (
    <div className={styles.root}>
      <div className={styles.page({ width: "content", density: "regular" })}>
        <PageHeader
          header={header}
          actions={actions}
          primaryAction={primaryAction}
          isNarrow={isNarrow}
        />
        {isNarrow ? (
          <div className={styles.slideStack}>
            {slides}
            {notes}
          </div>
        ) : (
          <div className={styles.presentation}>
            <div className={styles.thumbnails}>{thumbnails}</div>
            <div className={styles.stage}>
              {slide}
              {notes}
            </div>
          </div>
        )}
      </div>
      <MainActionBar primaryAction={primaryAction} isNarrow={isNarrow} />
    </div>
  );
}
