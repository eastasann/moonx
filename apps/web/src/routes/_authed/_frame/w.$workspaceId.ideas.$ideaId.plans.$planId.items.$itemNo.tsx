import { createFileRoute, notFound } from "@tanstack/react-router";
import { planItemSearchSchema } from "../../../lib/plans";
import { PlanItemScreen } from "../../../screens/PlanItem";

const ITEM_COUNT = 30;

export const Route = createFileRoute(
  "/_authed/_frame/w/$workspaceId/ideas/$ideaId/plans/$planId/items/$itemNo",
)({
  staticData: {
    crumb: ({ t, params }) => t("planItem:crumb", { itemNo: params.itemNo }),
  },
  validateSearch: planItemSearchSchema,
  // Anything but 1 to 30 is a typed link, not an item (SDD 4).
  beforeLoad: ({ params }) => {
    const itemNo = Number(params.itemNo);
    if (!Number.isInteger(itemNo) || itemNo < 1 || itemNo > ITEM_COUNT) throw notFound();
  },
  component: PlanItemRoute,
});

function PlanItemRoute() {
  const { workspaceId, ideaId, planId, itemNo } = Route.useParams();
  const { q, version } = Route.useSearch();
  return (
    <PlanItemScreen
      workspaceId={workspaceId}
      ideaId={ideaId}
      planId={planId}
      itemNo={Number(itemNo)}
      focusQuestion={q}
      versionId={version}
    />
  );
}
