import type { FieldSpec } from "../lib/row-fields";
import { describeFields } from "../lib/row-fields";
import type { RowEditor } from "../lib/use-row-editor";
import { ConflictDialog } from "./ConflictDialog";
import { SaveFailureNotice } from "./SaveFailureNotice";

/**
 * What a row editor reports besides its fields: a save that failed, with Retry, and the choice
 * after another person saved the row first (design-spec 6.0.2).
 */
export function RowEditorNotices({
  editor,
  specs,
  itemName,
}: {
  editor: RowEditor;
  specs: readonly FieldSpec[];
  /** What the row is called in the sentence "Paolo updated this {itemName} 3 minutes ago". */
  itemName: string;
}) {
  const { item } = editor;
  const { failure } = item;
  return (
    <>
      {failure ? <SaveFailureNotice failure={failure} onRetry={editor.retry} /> : null}
      <ConflictDialog
        current={item.conflict}
        itemName={itemName}
        theirText={describeFields(specs, item.conflict?.value as Record<string, unknown>)}
        mineText={describeFields(specs, item.mine ?? undefined)}
        onLoadTheirs={item.loadTheirs}
        onKeepMine={item.keepMine}
      />
    </>
  );
}
