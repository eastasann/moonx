import { MoonMark } from "../internal/MoonMark";
import * as styles from "./Landing.css";

export interface PhaseRouteProps {
  /** The parts in their order, each with the moon of how far along it is (0, 0.5, 1). */
  phases: { value: number; title: string; description: string }[];
  /** The level of the parts' titles in the page outline. @default 3 */
  headingLevel?: 2 | 3 | 4;
}

/**
 * The landing's three parts on a line of moons (1, design-spec 6.16, s01-landing.html
 * .route): new, half and full, joined by a line; across on a desktop, down at
 * `layout.public.stack-max-width` and narrower.
 */
export function PhaseRoute({ phases, headingLevel = 3 }: PhaseRouteProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <ol className={styles.route}>
      {phases.map((phase) => (
        <li key={phase.title} className={styles.routeItem}>
          <span className={styles.routeMark}>
            <MoonMark
              shape={{ value: phase.value }}
              className={styles.routeMoon}
            />
          </span>
          <div>
            <Heading className={styles.routeTitle}>{phase.title}</Heading>
            <p className={styles.routeText}>{phase.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
