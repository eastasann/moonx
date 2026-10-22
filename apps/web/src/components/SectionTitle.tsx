import type { ValidationHome } from "@moonx/schemas";
import {
  ActionButton,
  Flex,
  Heading,
  type HeadingProps,
  Menu,
  MenuItem,
  MenuTrigger,
} from "@moonx/ui-web";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { sectionHref } from "../lib/links";
import { useWorkspace } from "./workspace";

/**
 * A section's title on its screen with ▼, the switch to the other sections (design-spec
 * 6.2 「本文の見出し」): the menu, named `menuLabel`, lists `sections` and opens them.
 */
export function SectionSwitchTitle({
  sections,
  title,
  menuLabel,
  variant,
}: {
  sections: readonly { key: string; title: string; href: string }[];
  title: string;
  menuLabel: string;
  variant?: HeadingProps["variant"];
}) {
  const { t } = useTranslation(["validation"]);
  return (
    <Flex gap="space-50" alignItems="center">
      <Heading level={1} variant={variant}>
        {title}
      </Heading>
      <MenuTrigger>
        <ActionButton
          isQuiet
          aria-label={t("validation:questions.switchSection")}
        >
          <ChevronDown />
        </ActionButton>
        <Menu aria-label={menuLabel}>
          {sections.map((candidate) => (
            <MenuItem
              key={candidate.key}
              id={candidate.key}
              href={candidate.href}
            >
              {candidate.title}
            </MenuItem>
          ))}
        </Menu>
      </MenuTrigger>
    </Flex>
  );
}

/**
 * A validation section's title on its screen with ▼, the section switch (design-spec 5章
 * 「検証の中の移動」: 11 and 14〜18 move to another section without going back to 13).
 * The menu lists the sections whose screens there are, by V1's names.
 */
export function SectionTitle({
  ideaId,
  sections,
  title,
  variant,
}: {
  ideaId: string;
  sections: ValidationHome["sections"];
  /** The section's name, as V1 names it ("05 Costs"). */
  title: string;
  variant?: HeadingProps["variant"];
}) {
  const { t } = useTranslation(["validation"]);
  const { workspace } = useWorkspace();
  const switchable = sections.flatMap((candidate) => {
    const href = sectionHref(workspace.id, ideaId, candidate.key);
    return href === undefined
      ? []
      : [{ key: candidate.key, href, title: candidate.title }];
  });
  return (
    <SectionSwitchTitle
      sections={switchable}
      title={title}
      menuLabel={t("validation:home.sections.title")}
      variant={variant}
    />
  );
}
