import type {
  createQuestionBodySchema,
  createSectionBodySchema,
  TemplateVersionDetail,
  updateQuestionBodySchema,
  updateSectionBodySchema,
} from "@moonx/schemas";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { z } from "zod";
import { ADMIN_KEY } from "./admin";
import { api, call } from "./api";
import { refreshAfterContentChange } from "./history";
import { saveStatus } from "./save-status";

const fetchTemplates = () => call(api().api.v1.admin.templates.get());

/** AD1: the three templates with their versions. */
export const adminTemplatesQuery = queryOptions({
  queryKey: [...ADMIN_KEY, "templates"],
  queryFn: fetchTemplates,
});

export type AdminTemplateList = Awaited<ReturnType<typeof fetchTemplates>>;
export type AdminTemplate = AdminTemplateList["items"][number];

/** AD3: one version with its whole tree. */
export const templateVersionQuery = (versionId: string) =>
  queryOptions({
    queryKey: [...ADMIN_KEY, "template-version", versionId],
    queryFn: () => call(api().api.v1.admin["template-versions"]({ versionId }).get()),
  });

export type TemplateSectionNode = TemplateVersionDetail["sections"][number];
export type TemplateQuestionNode = TemplateSectionNode["questions"][number];

/** The nodes of the tree that are not a section or a question; the `node` search parameter names them. */
export const PSEUDO_NODES = [
  "ai-prompt",
  "cost-defaults",
  "check-rules",
  "execution-presets",
] as const;
export type PseudoNode = (typeof PSEUDO_NODES)[number];

export const isPseudoNode = (node: string | undefined): node is PseudoNode =>
  PSEUDO_NODES.includes(node as PseudoNode);

/** Which of the pseudo nodes a kind of template has (design-spec 6.17 27). */
export function pseudoNodesOf(kind: TemplateVersionDetail["kind"]): PseudoNode[] {
  if (kind === "validation") return ["ai-prompt", "cost-defaults", "check-rules"];
  if (kind === "business_plan") return ["ai-prompt", "execution-presets"];
  return ["ai-prompt"];
}

/** Screen 27's search parameters (SDD 4). */
export const templateEditSearchSchema = z.object({
  node: z.string().optional().catch(undefined),
});

/** AD2: copy a version into the template's draft. */
export function useCreateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      call(api().api.v1.admin["template-versions"]({ versionId }).draft.post()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, "templates"] }),
  });
}

/**
 * The writes of screen 27. Each hands the response to the cached version, so the tree and the
 * editors beside it never wait for a second read. A node's patch merges only the fields that were
 * sent: two saves of one node can finish out of order, and the older response must not undo the
 * newer one.
 */
export function useTemplateWrites(versionId: string) {
  const queryClient = useQueryClient();
  const key = templateVersionQuery(versionId).queryKey;
  const edit = (change: (detail: TemplateVersionDetail) => TemplateVersionDetail) =>
    queryClient.setQueryData<TemplateVersionDetail>(key, (detail) =>
      detail ? change(detail) : detail,
    );
  /**
   * A list's PUT answers with the whole version. Only the part that PUT owns is taken from it:
   * a node's patch can have finished first, and the older whole copy would undo it.
   */
  const replacePart =
    (part: "costDefaults" | "checkRules" | "executionPresets") => (detail: TemplateVersionDetail) =>
      edit((current) => ({ ...current, [part]: detail[part] }));
  /** The order PUT: sections and questions take the answer's order and keep their fields. */
  const replaceOrder = (detail: TemplateVersionDetail) =>
    edit((current) => {
      const sections = new Map(current.sections.map((section) => [section.id, section]));
      const questions = new Map(
        current.sections.flatMap((section) => section.questions.map((q) => [q.id, q] as const)),
      );
      return {
        ...current,
        sections: detail.sections.flatMap((ordered) => {
          const section = sections.get(ordered.id);
          return section
            ? [
                {
                  ...section,
                  sortOrder: ordered.sortOrder,
                  questions: ordered.questions.flatMap((q) => {
                    const question = questions.get(q.id);
                    return question ? [{ ...question, sortOrder: q.sortOrder }] : [];
                  }),
                },
              ]
            : [];
        }),
      };
    });
  const version = () => api().api.v1.admin["template-versions"]({ versionId });

  return {
    aiPrompt: useMutation({
      mutationFn: (aiPrompt: string) => call(version().patch({ aiPrompt })),
      onSuccess: (detail) => edit((current) => ({ ...current, aiPrompt: detail.aiPrompt })),
    }),
    addSection: useMutation({
      mutationFn: (body: SectionInput) => call(version().sections.post(body)),
      onSuccess: (section) =>
        edit((current) => ({
          ...current,
          sections: [...current.sections, { ...section, questions: [] }],
        })),
    }),
    patchSection: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: SectionPatch }) =>
        call(api().api.v1.admin["template-sections"]({ sectionId: id }).patch(patch)),
      onSuccess: (section, { id, patch }) =>
        edit((current) => ({
          ...current,
          sections: current.sections.map((candidate) =>
            candidate.id === id ? { ...candidate, ...pick(section, patch) } : candidate,
          ),
        })),
    }),
    deleteSection: useMutation({
      mutationFn: (id: string) =>
        call(api().api.v1.admin["template-sections"]({ sectionId: id }).delete()),
      onSuccess: (_, id) =>
        edit((current) => ({
          ...current,
          sections: current.sections.filter((section) => section.id !== id),
        })),
    }),
    addQuestion: useMutation({
      mutationFn: ({ sectionId, body }: { sectionId: string; body: QuestionInput }) =>
        call(api().api.v1.admin["template-sections"]({ sectionId }).questions.post(body)),
      onSuccess: (question, { sectionId }) =>
        edit((current) => ({
          ...current,
          sections: current.sections.map((section) =>
            section.id === sectionId
              ? { ...section, questions: [...section.questions, question] }
              : section,
          ),
        })),
    }),
    patchQuestion: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: QuestionPatch }) =>
        call(api().api.v1.admin["template-questions"]({ questionId: id }).patch(patch)),
      onSuccess: (question, { id, patch }) =>
        edit((current) => ({
          ...current,
          sections: current.sections.map((section) => ({
            ...section,
            questions: section.questions.map((candidate) =>
              candidate.id === id ? { ...candidate, ...pick(question, patch) } : candidate,
            ),
          })),
        })),
    }),
    deleteQuestion: useMutation({
      mutationFn: (id: string) =>
        call(api().api.v1.admin["template-questions"]({ questionId: id }).delete()),
      onSuccess: (_, id) =>
        edit((current) => ({
          ...current,
          sections: current.sections.map((section) => ({
            ...section,
            questions: section.questions.filter((question) => question.id !== id),
          })),
        })),
    }),
    order: useMutation({
      mutationFn: (sections: { id: string; questionIds: string[] }[]) =>
        call(version().order.put({ sections })),
      onSuccess: replaceOrder,
    }),
    costDefaults: useMutation({
      mutationFn: (items: TemplateCostDefaultInput[]) =>
        call(version()["cost-defaults"].put({ items })),
      onSuccess: replacePart("costDefaults"),
    }),
    checkRules: useMutation({
      mutationFn: (items: TemplateVersionDetail["checkRules"]) =>
        call(version()["check-rules"].put({ items })),
      onSuccess: replacePart("checkRules"),
    }),
    executionPresets: useMutation({
      mutationFn: (items: TemplateExecutionPresetInput[]) =>
        call(version()["execution-presets"].put({ items })),
      onSuccess: replacePart("executionPresets"),
    }),
    validate: useMutation({
      mutationFn: () => call(version().validate.post()),
    }),
    publish: useMutation({
      mutationFn: () => call(version().publish.post()),
      // An operator who is also a member sees "A newer template is available" on the next read.
      onSuccess: () =>
        Promise.all([
          refreshAfterContentChange(queryClient),
          queryClient.invalidateQueries({ queryKey: ADMIN_KEY }),
        ]),
    }),
  };
}

export type SectionInput = z.input<typeof createSectionBodySchema>;
export type SectionPatch = z.input<typeof updateSectionBodySchema>;
export type QuestionInput = z.input<typeof createQuestionBodySchema>;
export type QuestionPatch = z.input<typeof updateQuestionBodySchema>;

export type TemplateCostDefaultInput = Pick<
  TemplateVersionDetail["costDefaults"][number],
  "category" | "key" | "name"
>;
export type TemplateExecutionPresetInput = {
  type: TemplateVersionDetail["executionPresets"][number]["type"];
  title: string;
  area?: string | null;
  launchTiming?: TemplateVersionDetail["executionPresets"][number]["launchTiming"];
};

/** The fields of `node` whose names appear in `patch`. */
function pick<Node extends object>(node: Node, patch: object): Partial<Node> {
  const out: Partial<Node> = {};
  for (const field of Object.keys(patch) as (keyof Node)[]) {
    if (field in node) out[field] = node[field];
  }
  return out;
}

const flushers = new Set<() => void>();
const inflight = new Set<Promise<unknown>>();

/**
 * Sends every draft edit still waiting for its pause, and resolves once all sends have finished.
 * Publishing starts here: the checks and the publish read the draft as the server has it.
 */
export async function settleDraftSaves(): Promise<void> {
  for (const flush of [...flushers]) flush();
  await Promise.allSettled([...inflight]);
}

/** Runs one write of the draft under the header's save state, which shows its failure and retries it. */
export function trackDraftSave(run: () => Promise<unknown>): Promise<unknown> {
  const sent = saveStatus.track(run).catch(() => {});
  inflight.add(sent);
  void sent.finally(() => inflight.delete(sent));
  return sent;
}

/**
 * Debounced autosave of a draft's editor (design-spec 6.17: autosave of the draft). Changes made
 * before the timer fires merge into one patch that goes out `delayMs` after the last change;
 * `flush` sends it now (on blur), and unmounting flushes too, so leaving a node or the screen never
 * drops typed text. The header's save state follows each send.
 */
export function useDebouncedPatch<Patch extends object>(
  save: (patch: Patch) => Promise<unknown>,
  delayMs = 700,
) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const waiting = useRef<Patch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const patch = waiting.current;
    if (!patch) return;
    waiting.current = null;
    void trackDraftSave(() => saveRef.current(patch));
  }, []);

  const schedule = useCallback(
    (patch: Patch) => {
      waiting.current = { ...waiting.current, ...patch };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delayMs);
    },
    [flush, delayMs],
  );

  useEffect(() => {
    flushers.add(flush);
    return () => {
      flushers.delete(flush);
      flush();
    };
  }, [flush]);
  return { schedule, flush };
}
