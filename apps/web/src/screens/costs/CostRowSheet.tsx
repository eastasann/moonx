import { Button, Checkbox, Dialog, Stack } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import {
  AmountField,
  CanReduceField,
  FauField,
  NameField,
  NotesField,
  type RowView,
  useRowName,
  WhyNeededField,
} from "./CostFields";

/**
 * Below tablet a row is a card; pressing it opens this sheet with every field of the row, in the
 * bottom sheet that `Dialog` becomes there (design-spec 6.3, 4.3).
 */
export function CostRowSheet({
  view,
  onClose,
  autoFocusName,
}: {
  view: RowView;
  onClose: () => void;
  /** The row was just added: the cursor starts in its name. */
  autoFocusName: boolean;
}) {
  const { t } = useTranslation("costs");
  const { item, draft, api, isReadOnly } = view;
  const name = useRowName(draft);
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
      title={name}
      closeLabel={t("sheet.close")}
      size="medium"
      actions={<Button onPress={onClose}>{t("sheet.done")}</Button>}
    >
      <Stack gap="space-300">
        <NameField view={view} autoFocus={autoFocusName} />
        <AmountField view={view} />
        <FauField view={view} />
        {item.category === "initial" ? (
          <>
            <WhyNeededField view={view} />
            <CanReduceField view={view} />
          </>
        ) : null}
        {item.category === "monthly_fixed" ? <NotesField view={view} /> : null}
        {isReadOnly ? null : (
          <Checkbox isSelected={draft.isLumpSum} onChange={api.setLumpSum}>
            {t("fields.lumpSum")}
          </Checkbox>
        )}
      </Stack>
    </Dialog>
  );
}
