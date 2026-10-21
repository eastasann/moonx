import type { TagSize } from "@moonx/ui-tokens";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import {
  TagGroup as AriaTagGroup,
  Button,
  type Key,
  Label,
  Tag,
  TagList,
  Text,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { FixedLocale } from "../internal/FixedLocale";
import * as field from "../internal/field.css";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./TagGroup.css";

/** One tag. */
export interface TagItem {
  id: string;
  label: string;
  /**
   * Words after the label that a narrow tag never cuts off, as the label is: "(deleted)"
   * on a research log's chip (design-spec 6.0.3).
   */
  suffix?: string;
}

export interface TagGroupProps {
  items: Iterable<TagItem>;
  /** Removes tags; each tag shows a remove button when given (design-spec 4.5). */
  onRemove?: (ids: Set<string>) => void;
  label?: ReactNode;
  description?: ReactNode;
  /** Shown in place of the tags when there are none. */
  renderEmptyState?: () => ReactNode;
  /** @default "M" */
  size?: TagSize;
  id?: string;
  "aria-label"?: string;
}

/**
 * A row of tags, removable one by one (the checks a research log supports, the
 * conditions of a filter). Arrow keys move between the tags; Delete removes one.
 */
export function TagGroup({
  items,
  onRemove,
  label,
  description,
  renderEmptyState,
  size = "M",
  ...props
}: TagGroupProps) {
  const { t } = useTranslation(["components"]);
  return (
    <FixedLocale>
      <AriaTagGroup
        {...props}
        onRemove={
          onRemove &&
          ((keys: Set<Key>) => onRemove(new Set([...keys].map(String))))
        }
        className={styles.group}
      >
        {label != null && <Label className={field.label}>{label}</Label>}
        <TagList
          items={items}
          renderEmptyState={renderEmptyState}
          className={styles.list}
        >
          {(item) => (
            <Tag
              id={item.id}
              textValue={
                item.suffix === undefined
                  ? item.label
                  : `${item.label} ${item.suffix}`
              }
              className={styles.tag({ size })}
            >
              {({ allowsRemoving }) => (
                <>
                  <span className={styles.tagLabel}>{item.label}</span>
                  {item.suffix !== undefined && (
                    <span className={styles.tagSuffix}>{item.suffix}</span>
                  )}
                  {allowsRemoving && (
                    <Button
                      slot="remove"
                      aria-label={t("components:tagGroup.remove")}
                      className={styles.remove}
                    >
                      <IconSlot size={size}>
                        <X />
                      </IconSlot>
                    </Button>
                  )}
                </>
              )}
            </Tag>
          )}
        </TagList>
        {description != null && (
          <Text slot="description" className={field.description}>
            {description}
          </Text>
        )}
      </AriaTagGroup>
    </FixedLocale>
  );
}
