import {
  dateOnlySchema,
  decisionLogKindSchema,
  uuidSchema,
} from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import {
  DecisionLogScreen,
  DecisionLogSkeleton,
  type DecisionsSearch,
} from "../../../../screens/DecisionLog";

/**
 * `/w/$workspaceId/decisions`: 7 Decision Log (SDD 4章). Values it cannot read are left
 * out.
 */
export const Route = createFileRoute("/_signedIn/w/$workspaceId/decisions")({
  validateSearch: (search: Record<string, unknown>): DecisionsSearch => ({
    kind: decisionLogKindSchema.safeParse(search.kind).data,
    idea: uuidSchema.safeParse(search.idea).data,
    recordedBy: uuidSchema.safeParse(search.recordedBy).data,
    from: dateOnlySchema.safeParse(search.from).data,
    to: dateOnlySchema.safeParse(search.to).data,
    selected: uuidSchema.safeParse(search.selected).data,
  }),
  staticData: { skeleton: DecisionLogSkeleton },
  component: DecisionLogRoute,
});

function DecisionLogRoute() {
  const {
    modal: _,
    about: __,
    panel: ___,
    target: ____,
    ...search
  } = Route.useSearch();
  return <DecisionLogScreen search={search} />;
}
