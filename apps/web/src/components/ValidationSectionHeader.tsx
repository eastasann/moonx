import {
  ActionButton,
  Flex,
  Heading,
  InlineAlert,
  Link,
  Menu,
  MenuItem,
  Stack,
} from "@moonx/ui-web";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { sectionPath, VALIDATION_SECTION_ORDER } from "../lib/questions";

export interface ValidationSectionHeaderProps {
  workspaceId: string;
  ideaId: string;
  /** The section's key in the template, such as `05`. */
  sectionKey: string;
  /** The text of the link back to the validation home, such as "← Validation". */
  backLabel: string;
  isArchived: boolean;
  /** Notes under the title row (a state banner, a read-only remark). */
  children?: ReactNode;
}

/**
 * The top of a validation section screen that is not a question form: a link back to the home,
 * the section's name with the switcher to its neighbours (design-spec 4.2), and the notice of an
 * archived idea.
 */
export function ValidationSectionHeader({
  workspaceId,
  ideaId,
  sectionKey,
  backLabel,
  isArchived,
  children,
}: ValidationSectionHeaderProps) {
  const { t } = useTranslation(["form", "validation"]);
  const ideaBase = `/w/${workspaceId}/ideas/${ideaId}`;
  const sectionTitle = (key: string) => t(`validation:sections.${key}`);
  return (
    <Stack gap="space-200">
      <Link href={ideaBase}>{backLabel}</Link>
      {isArchived ? <InlineAlert variant="notice" heading={t("form:archived")} /> : null}
      <Flex gap="space-100" align="center" wrap>
        <Heading level={1}>{sectionTitle(sectionKey)}</Heading>
        <Menu
          trigger={
            <ActionButton isQuiet icon={<ChevronDown />} aria-label={t("form:switchSection")} />
          }
        >
          {VALIDATION_SECTION_ORDER.map((key) => (
            <MenuItem key={key} id={key} href={`${ideaBase}${sectionPath(key)}`}>
              {sectionTitle(key)}
            </MenuItem>
          ))}
        </Menu>
      </Flex>
      {children}
    </Stack>
  );
}
