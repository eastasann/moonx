import { isQuestionKey } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import {
  QuestionFormScreen,
  type QuestionFormSearch,
  QuestionFormSkeleton,
} from "../../../../../../screens/QuestionForm";

/**
 * `/w/$workspaceId/ideas/$ideaId/questions/$sectionKey`: 11 Question form for a
 * validation section (SDD 4章). A `q` that is no validation question ID (design-spec 6.6)
 * is left out.
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/questions/$sectionKey",
)({
  validateSearch: (search: Record<string, unknown>): QuestionFormSearch => ({
    q:
      typeof search.q === "string" && isQuestionKey(search.q, "validation")
        ? search.q
        : undefined,
  }),
  staticData: { skeleton: QuestionFormSkeleton },
  component: QuestionFormRoute,
});

function QuestionFormRoute() {
  const { ideaId, sectionKey } = Route.useParams();
  const { modal, about, ...search } = Route.useSearch();
  return (
    <QuestionFormScreen
      ideaId={ideaId}
      sectionKey={sectionKey}
      search={search}
      modal={modal}
      about={about}
    />
  );
}
