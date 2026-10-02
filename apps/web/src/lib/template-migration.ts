import {
  type TemplateKind,
  type TemplateMigrationBody,
  type TemplateMigrationPreview,
  type TemplateRef,
  templateKindSchema,
} from "@moonx/schemas";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { sendJson } from "./api";
import { refreshAfterContentChange } from "./history";

/** The thing a migration works on, as `?about=` names it: `<targetType>:<targetId>`. */
export interface MigrationTarget {
  kind: TemplateKind;
  id: string;
}

export const formatMigrationTarget = (kind: TemplateKind, id: string) => `${kind}:${id}`;

/** Reads `?about=` of M8. A value that names no template kind (a typed or old link) is null. */
export function parseMigrationTarget(about: string | undefined): MigrationTarget | null {
  const [kind, id, ...rest] = (about ?? "").split(":");
  const parsed = templateKindSchema.safeParse(kind);
  return parsed.success && id && rest.length === 0 ? { kind: parsed.data, id } : null;
}

/**
 * T1. Read again on every open, since a version published or an answer written since the last
 * look changes what the move would carry and hide.
 */
export const migrationPreviewQuery = ({ kind, id }: MigrationTarget) =>
  queryOptions({
    queryKey: ["template-migration", "preview", kind, id] as const,
    queryFn: () =>
      sendJson<TemplateMigrationPreview>(
        "GET",
        `/api/v1/template-migrations/preview?${new URLSearchParams({ targetType: kind, targetId: id })}`,
      ),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

/** T2, then a refresh of every screen that reads the answers or the template version. */
export function useTemplateMigration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TemplateMigrationBody) =>
      sendJson<{ batchId: string; template: TemplateRef }>(
        "POST",
        "/api/v1/template-migrations",
        body,
      ),
    onSuccess: () => refreshAfterContentChange(queryClient),
  });
}
