import type { ComponentSize } from "@moonx/ui-tokens";
import { X } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import {
  Tag as AriaTag,
  TagGroup as AriaTagGroup,
  Button,
  Label,
  TagList,
  Text,
} from "react-aria-components";
import {
  description as descriptionClass,
  errorMessage as errorClass,
  fieldRoot,
  fieldRootAuto,
  icon,
  label as labelClass,
} from "../_internal/field.css";
import { removeButton, tag, tagList } from "./TagGroup.css";

interface TagContextValue {
  size: ComponentSize;
  removeLabel: string | undefined;
}

const TagContext = createContext<TagContextValue>({ size: "M", removeLabel: undefined });

interface TagGroupBase {
  description?: ReactNode;
  /** Rendered only while `isInvalid` is true, so it can stay set while the group is valid. */
  errorMessage?: ReactNode;
  isInvalid?: boolean;
  size?: ComponentSize;
  /**
   * Makes every tag removable. Receives the `id`s of the removed tags; the screen drops them from
   * its list.
   */
  onRemove?: (ids: string[]) => void;
  /** Accessible name of each remove button. The tag's text is appended by the browser's name computation. */
  removeLabel?: string;
  /** Required. `Tag` items only. */
  children: ReactNode;
}

interface TagGroupWithLabel extends TagGroupBase {
  label: ReactNode;
  "aria-label"?: string;
}

interface TagGroupWithAriaLabel extends TagGroupBase {
  label?: undefined;
  "aria-label": string;
}

export type TagGroupProps = (TagGroupWithLabel | TagGroupWithAriaLabel) &
  (
    | { onRemove?: undefined; removeLabel?: string }
    | { onRemove: (ids: string[]) => void; removeLabel: string }
  );

export function TagGroup({
  label,
  description,
  errorMessage,
  isInvalid,
  size = "M",
  onRemove,
  removeLabel,
  children,
  "aria-label": ariaLabel,
}: TagGroupProps) {
  return (
    <TagContext.Provider value={{ size, removeLabel }}>
      <AriaTagGroup
        aria-label={label ? undefined : ariaLabel}
        onRemove={onRemove ? (keys) => onRemove([...keys].map(String)) : undefined}
        className={`${fieldRoot({ size })} ${fieldRootAuto}`}
      >
        {label ? <Label className={labelClass({ size })}>{label}</Label> : null}
        <TagList className={tagList}>{children}</TagList>
        {description ? (
          <Text slot="description" className={descriptionClass}>
            {description}
          </Text>
        ) : null}
        {isInvalid && errorMessage ? (
          <Text slot="errorMessage" className={errorClass}>
            {errorMessage}
          </Text>
        ) : null}
      </AriaTagGroup>
    </TagContext.Provider>
  );
}

export interface TagProps {
  id: string;
  children: ReactNode;
  /** Plain text of the tag. Needed when `children` is not a string. */
  textValue?: string;
  isDisabled?: boolean;
}

export function Tag({ children, ...props }: TagProps) {
  const { size, removeLabel } = useContext(TagContext);
  return (
    <AriaTag {...props} className={tag({ size })}>
      {({ allowsRemoving }) => (
        <>
          {children}
          {allowsRemoving ? (
            <Button slot="remove" aria-label={removeLabel} className={removeButton}>
              <X aria-hidden="true" className={icon({ size })} />
            </Button>
          ) : null}
        </>
      )}
    </AriaTag>
  );
}
