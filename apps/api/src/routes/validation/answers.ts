import {
  createEvidenceBodySchema,
  putAnswerBodySchema,
  removeEvidenceQuerySchema,
} from "@moonx/schemas";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AppContext } from "../../context";
import { ApiError } from "../../errors";
import { historyActor } from "../../lib/dto";
import { requireWritable, resolveScope } from "../../lib/scope";
import {
  buildValidationAnswers,
  loadTemplateSection,
  saveAnswer,
} from "../../lib/validation-answers";
import { loadValidationData } from "../../lib/validation-data";
import { createEvidence, removeEvidence } from "../../lib/validation-evidence";
import { authPlugin } from "../../plugins";

/** Sections the question form serves; 04 and 08 are answered through V8 and V15 (SDD 5.7 V2). */
const FORM_SECTIONS = new Set(["01", "02", "10"]);

/** V2-V5 (SDD 5.7). */
export function validationAnswerRoutes(ctx: AppContext) {
  const { db } = ctx;
  const validationParams = z.object({ validationId: z.uuid() });
  return new Elysia({ name: "moonx-validation-answers" })
    .use(authPlugin(ctx))
    .get(
      "/validations/:validationId/questions/:sectionKey",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        if (!FORM_SECTIONS.has(params.sectionKey)) {
          throw new ApiError("NOT_FOUND", "No such section");
        }
        const data = (await loadValidationData(db, [params.validationId])).get(params.validationId);
        const section =
          data && (await loadTemplateSection(db, data.templateVersionId, params.sectionKey));
        if (!data || !section) throw new ApiError("NOT_FOUND", "No such section");
        const questions = data.questions.filter((q) => q.sectionKey === section.key);
        return {
          section,
          answers: await buildValidationAnswers(db, scope.workspaceId, data, questions),
        };
      },
      { params: z.object({ validationId: z.uuid(), sectionKey: z.string().max(10) }) },
    )
    .put(
      "/validations/:validationId/answers/:questionKey",
      async ({ params, body, user, request }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        requireWritable(scope);
        return db.transaction((tx) =>
          saveAnswer(
            tx,
            {
              workspaceId: scope.workspaceId,
              ideaId: scope.ideaId as string,
              validationId: params.validationId,
              actor: historyActor(request, user),
              now: ctx.now(),
            },
            params.questionKey,
            body,
          ),
        );
      },
      {
        params: z.object({ validationId: z.uuid(), questionKey: z.string().max(100) }),
        body: putAnswerBodySchema,
      },
    )
    .post(
      "/validations/:validationId/evidence",
      async ({ params, body, user, request, set }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        requireWritable(scope);
        const result = await db.transaction((tx) =>
          createEvidence(
            tx,
            {
              workspaceId: scope.workspaceId,
              ideaId: scope.ideaId as string,
              validationId: params.validationId,
              actor: historyActor(request, user),
              now: ctx.now(),
            },
            body,
          ),
        );
        set.status = 201;
        return result;
      },
      { params: validationParams, body: createEvidenceBodySchema },
    )
    .delete(
      "/evidence/:evidenceId",
      async ({ params, query, user, request }) => {
        const scope = await resolveScope(db, user, { evidenceId: params.evidenceId });
        requireWritable(scope);
        return db.transaction((tx) =>
          removeEvidence(
            tx,
            {
              workspaceId: scope.workspaceId,
              ideaId: scope.ideaId as string,
              validationId: scope.validationId as string,
              actor: historyActor(request, user),
              now: ctx.now(),
            },
            params.evidenceId,
            { lockVersion: query.lockVersion, force: query.force },
          ),
        );
      },
      { params: z.object({ evidenceId: z.uuid() }), query: removeEvidenceQuerySchema },
    );
}
