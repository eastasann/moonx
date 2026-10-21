import { Button, InlineAlert } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { useIdeaActions } from "./ideaActions";
import { useWorkspace } from "./workspace";

/**
 * "This idea is archived" at the top of a screen of an archived idea (design-spec 6.1・
 * 6.2・6.10), with Restore for the Owners and Members: the screen reads only until then.
 */
export function ArchivedIdeaAlert({ ideaId }: { ideaId: string }) {
  const { t } = useTranslation(["validation"]);
  const { role } = useWorkspace();
  const actions = useIdeaActions();
  return (
    <InlineAlert title={t("validation:home.archived")}>
      {role !== "viewer" && (
        <Button
          variant="secondary"
          size="S"
          onPress={() => actions.restore(ideaId)}
        >
          {t("validation:home.restore")}
        </Button>
      )}
    </InlineAlert>
  );
}
