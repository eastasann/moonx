import { useOverlay } from "../lib/overlay";
import { commentTargetOf, parsePanelTarget, useHeaderPanelTarget } from "../lib/panel-target";
import { CommentsPanel } from "./CommentsPanel";
import { OverlayErrorBoundary } from "./ErrorBoundary";
import { HistoryPanel } from "./HistoryPanel";

/**
 * Shows PNL-1 or PNL-2 for the `?panel=` and `?target=` of the URL (SDD 4). A target that names
 * nothing the panel can show (a typed or old link) shows no panel.
 */
export function PanelHost() {
  const { panel, target, closePanel } = useOverlay();
  return (
    <OverlayErrorBoundary key={`${panel}:${target}`} onClose={closePanel}>
      <Panel />
    </OverlayErrorBoundary>
  );
}

function Panel() {
  const { panel, target, closePanel } = useOverlay();
  const { archived } = useHeaderPanelTarget();
  const parsed = parsePanelTarget(target);
  if (!panel || !parsed) return null;
  if (panel === "history") {
    return <HistoryPanel key={target} target={parsed} onClose={closePanel} />;
  }
  const comment = parsePanelTarget(commentTargetOf(parsed));
  if (comment?.kind !== "item") return null;
  return <CommentsPanel key={target} target={comment} isArchived={archived} onClose={closePanel} />;
}
