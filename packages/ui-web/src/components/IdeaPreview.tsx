import type { MoonState } from "../internal/MoonMark";
import { MoonMark } from "../internal/MoonMark";
import * as styles from "./Landing.css";

export interface IdeaPreviewProps {
  /** The example idea's name ("Office Lunch Bowls"). */
  name: string;
  /** Its stage, at the end of the head ("Validation"). */
  stage: string;
  /** Two of its key numbers, side by side ("Startup costs ₱145,000+"). */
  metrics: { label: string; value: string }[];
  /** Some of its checks: the moon, the name, the state at the end ("Done (4)"). */
  checks: { state: MoonState; label: string; status: string }[];
  /** Under it: what the example is ("An example idea in validation."). */
  caption: string;
}

/**
 * The landing's floating example (1, design-spec 6.16, s01-landing.html .preview): an idea
 * in validation drawn with the app's own forms, on a card that floats with a large soft
 * shadow.
 */
export function IdeaPreview({
  name,
  stage,
  metrics,
  checks,
  caption,
}: IdeaPreviewProps) {
  return (
    <figure className={styles.preview}>
      <div className={styles.previewHead}>
        <span className={styles.previewName}>{name}</span>
        <span className={styles.previewStage}>{stage}</span>
      </div>
      <div className={styles.previewNumbers}>
        {metrics.map((metric) => (
          <div key={metric.label} className={styles.previewNumber}>
            <div className={styles.previewLabel}>{metric.label}</div>
            <div className={styles.previewValue}>{metric.value}</div>
          </div>
        ))}
      </div>
      <ul className={styles.previewChecks}>
        {checks.map((check) => (
          <li key={check.label} className={styles.previewCheck}>
            <MoonMark
              shape={{ state: check.state }}
              className={styles.previewMoon}
            />
            <span>{check.label}</span>
            <span className={styles.previewStatus}>{check.status}</span>
          </li>
        ))}
      </ul>
      <figcaption className={styles.previewCaption}>{caption}</figcaption>
    </figure>
  );
}
