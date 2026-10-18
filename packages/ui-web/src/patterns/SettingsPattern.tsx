import { Fragment, type ReactNode, useId } from "react";
import { Heading } from "../components/Heading";
import { Density } from "../internal/Density";
import { FieldWidthContext } from "../internal/size";
import { PageHeader } from "./PageHeader";
import * as styles from "./patterns.css";

/** One group of settings (4: Profile, Display, Password…). */
export interface SettingsGroup {
  id: string;
  /** The group's name, a level 2 heading. */
  title: string;
  /** A line under the name: what the group changes. */
  description?: ReactNode;
  /** The group's fields and buttons, one under another, filling the column. */
  content: ReactNode;
}

export interface SettingsPatternProps {
  /** The page's title ("Account", "Workspace settings"). */
  header: ReactNode;
  /** The screen's main action, if it has one: at the end of the title's line. */
  primaryAction?: ReactNode;
  groups: SettingsGroup[];
}

function Group({ group }: { group: SettingsGroup }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.settingsGroup}>
      <div className={styles.settingsLabel}>
        <Heading level={2} variant="heading-4" id={headingId}>
          {group.title}
        </Heading>
        {group.description}
      </div>
      <div className={styles.settingsContent}>
        <FieldWidthContext.Provider value="full">
          {group.content}
        </FieldWidthContext.Provider>
      </div>
    </section>
  );
}

/**
 * Pattern H, settings form (design-spec 4.1, s09-settings.html): settings changed one by
 * one (4, 9). The groups one under another in the form's column, each with its name on
 * the left and its fields filling the right; on a phone, the name above the fields.
 */
export function SettingsPattern({
  header,
  primaryAction,
  groups,
}: SettingsPatternProps) {
  return (
    <Density density="spacious">
      <div className={styles.root}>
        <div className={styles.settingsPage}>
          <div className={styles.settingsHeader}>
            <PageHeader header={header} primaryAction={primaryAction} />
          </div>
          {groups.map((group) => (
            <Group key={group.id} group={group} />
          ))}
        </div>
      </div>
    </Density>
  );
}

export interface SettingsFieldRowProps {
  /**
   * The fields and the button of one line (9's invitation: the email, its role, "Send
   * invitation"): the first fills the line, the second takes 06
   * layout.settings.field-row-control-width, the rest their own width. On a phone one
   * under another at full width (s09-settings.html .invite).
   */
  children: ReactNode;
}

/** Fields side by side in a settings group, ending in their button (s09-settings.html .invite). */
export function SettingsFieldRow({ children }: SettingsFieldRowProps) {
  return (
    <div className={styles.settingsFieldRow}>
      <FieldWidthContext.Provider value="full">
        {children}
      </FieldWidthContext.Provider>
    </div>
  );
}

export interface SettingsListProps {
  "aria-label": string;
  /** `SettingsListItem`s. */
  children: ReactNode;
}

/** 9's members or invitations, one per line between hairlines (s09-settings.html). */
export function SettingsList({ children, ...props }: SettingsListProps) {
  return (
    <ul {...props} className={styles.settingsList}>
      {children}
    </ul>
  );
}

export interface SettingsListItemProps {
  /** A member's Avatar, at the start; an invitation has none. */
  avatar?: ReactNode;
  /** The name ("Ana Villanueva"), or an invitation's email. */
  title: string;
  /** After the name, quieter: "(you)". */
  titleNote?: string;
  /** Under the name: the email, or what was sent and when it expires. */
  description?: string;
  /** Before the actions: the role's small Picker (S). */
  control?: ReactNode;
  /** At the end: the ⋯ ActionMenu, or the quiet Resend and Cancel. */
  actions?: ReactNode;
  /** Under the email, across to the role: why it cannot change ("This workspace needs at least one Owner"). */
  note?: string;
}

/**
 * An email breaks after its "@" and its dots when it must, not inside a word (an
 * invitation's title on a phone).
 */
function breakable(title: string): ReactNode {
  if (!title.includes("@")) return title;
  const parts = title.split(/(?<=[@.])/);
  return parts.length === 1
    ? title
    : parts.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ));
}

/**
 * A member or an invitation of 9: what it is on the left, its role and its actions at the
 * end, each in its column so they line up down the list (s09-settings.html .members li,
 * .inv li). Every prop shows with or without an avatar.
 */
export function SettingsListItem({
  avatar,
  title,
  titleNote,
  description,
  control,
  actions,
  note,
}: SettingsListItemProps) {
  const hasAvatar = avatar != null;
  const hasControl = control != null;
  // The note follows the email in the reading order, before the control it explains.
  return (
    <li className={styles.settingsRow({ hasAvatar, hasControl })}>
      {hasAvatar && <span className={styles.settingsRowAvatar}>{avatar}</span>}
      <span className={styles.settingsRowTitle({ hasAvatar })}>
        {breakable(title)}
        {titleNote !== undefined && (
          <>
            {" "}
            <span className={styles.settingsRowTitleNote}>{titleNote}</span>
          </>
        )}
      </span>
      {description !== undefined && (
        <span className={styles.settingsRowDescription({ hasAvatar })}>
          {description}
        </span>
      )}
      {note !== undefined && (
        <span className={styles.settingsRowNote({ hasAvatar })}>{note}</span>
      )}
      {control != null && (
        <span className={styles.settingsRowControl({ hasAvatar })}>
          <FieldWidthContext.Provider value="fit">
            {control}
          </FieldWidthContext.Provider>
        </span>
      )}
      {actions != null && (
        <span className={styles.settingsRowActions({ hasAvatar, hasControl })}>
          {actions}
        </span>
      )}
    </li>
  );
}
