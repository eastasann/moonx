import { type ReactNode, useId } from "react";
import { Heading } from "../components/Heading";
import { useIsNarrow } from "../internal/useIsNarrow";
import { MainActionBar, PageHeader } from "./PageHeader";
import * as styles from "./patterns.css";

/** One group of settings (4: Profile, Display, Password…). */
export interface SettingsGroup {
  id: string;
  /** The group's name, a level 2 heading. */
  title: string;
  /** A line under the name: what the group changes. */
  description?: ReactNode;
  /** The group's fields and buttons, one under another. */
  content: ReactNode;
}

export interface SettingsPatternProps {
  /** The page's title ("Account", "Workspace settings"). */
  header: ReactNode;
  /** The screen's main action, if it has one: fixed to the bottom on a phone. */
  primaryAction?: ReactNode;
  groups: SettingsGroup[];
}

function Group({ group }: { group: SettingsGroup }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.settingsGroup}>
      <div className={styles.settingsLabel}>
        <Heading level={2} id={headingId}>
          {group.title}
        </Heading>
        {group.description}
      </div>
      <div className={styles.settingsContent}>{group.content}</div>
    </section>
  );
}

/**
 * Pattern H, settings form (design-spec 4.1): settings changed one by one (4, 9). The
 * groups one under another in the reading column, each with its name on the left and
 * its fields on the right; on a phone, the name above the fields.
 */
export function SettingsPattern({
  header,
  primaryAction,
  groups,
}: SettingsPatternProps) {
  const isNarrow = useIsNarrow();
  return (
    <div className={styles.root}>
      <div className={styles.page({ width: "reading", density: "spacious" })}>
        <PageHeader
          header={header}
          primaryAction={primaryAction}
          isNarrow={isNarrow}
        />
        {groups.map((group) => (
          <Group key={group.id} group={group} />
        ))}
      </div>
      <MainActionBar primaryAction={primaryAction} isNarrow={isNarrow} />
    </div>
  );
}
