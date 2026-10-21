import type { TemplateKind } from "@moonx/schemas";
import { Button, Menu, MenuItem, MenuTrigger } from "@moonx/ui-web";
import { ChevronDown, FileDown, FileUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { aiExportHref, aiImportHref } from "../lib/ai";
import { useWorkspace } from "./workspace";

/**
 * AI ▼ with Export for AI and Import from AI (design-spec 6.1・6.2): 24 opens on `scope`
 * (the screen's section, or the whole), 25 imports into the whole target (6.7「取り込み先」).
 * Both come back to `returnTo`, the screen it is on. Owners and Members only, and not on
 * an archived idea or plan (6.8): the screen leaves it out otherwise.
 */
export function AiMenu({
  kind,
  id,
  scope,
  returnTo,
}: {
  kind: TemplateKind;
  /** The validation or plan; none for the user's own self-analysis. */
  id?: string;
  /** The scope 24 starts on (`scopeParam`); the whole when left out. */
  scope?: string;
  returnTo: string;
}) {
  const { t } = useTranslation(["ai"]);
  const { workspace } = useWorkspace();
  return (
    <MenuTrigger>
      <Button variant="secondary">
        {t("ai:menu.label")}
        <ChevronDown />
      </Button>
      <Menu>
        <MenuItem
          id="export"
          href={aiExportHref(workspace.id, { kind, id, scope, returnTo })}
          icon={<FileUp />}
        >
          {t("ai:menu.export")}
        </MenuItem>
        <MenuItem
          id="import"
          href={aiImportHref(workspace.id, { kind, id, returnTo })}
          icon={<FileDown />}
        >
          {t("ai:menu.import")}
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}
