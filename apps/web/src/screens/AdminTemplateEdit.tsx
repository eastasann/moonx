import type { TemplateValidation, TemplateVersionDetail } from "@moonx/schemas";
import {
  AlertDialog,
  Badge,
  Button,
  Flex,
  Heading,
  InlineAlert,
  Link,
  ListDetailPattern,
  Skeleton,
  Stack,
  Text,
  useBelowDesktop,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NotFoundState, QueryBoundary } from "../components/states";
import {
  isPseudoNode,
  settleDraftSaves,
  templateVersionQuery,
  trackDraftSave,
  useTemplateWrites,
} from "../lib/admin-templates";
import { isApiError } from "../lib/api-error";
import { errorText } from "../lib/error-text";
import { useGoTo } from "../lib/navigate";
import { toasts } from "../lib/toast";
import { AiPromptEditor } from "./admin-templates/AiPromptEditor";
import { CheckRulesEditor } from "./admin-templates/CheckRulesEditor";
import { CostDefaultsEditor } from "./admin-templates/CostDefaultsEditor";
import { ExecutionPresetsEditor } from "./admin-templates/ExecutionPresetsEditor";
import { type NewNode, NewNodeDialog } from "./admin-templates/NewNodeDialog";
import { PublishDialog } from "./admin-templates/PublishDialog";
import { QuestionEditor } from "./admin-templates/QuestionEditor";
import { SectionEditor } from "./admin-templates/SectionEditor";
import { TemplateTree } from "./admin-templates/TemplateTree";

function EditSkeleton() {
  return (
    <Stack gap="space-300">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

/**
 * Screen 27, Edit template (design-spec 6.17, pattern D with a tree): the outline on the left, the
 * chosen node's fields on the right. A draft saves as it is edited; a published version is read
 * only. The chosen node is `?node=` (a section or question id, or the name of a setting).
 */
export function AdminTemplateEdit({
  versionId,
  node,
  onNodeChange,
}: {
  versionId: string;
  node: string | undefined;
  onNodeChange: (node: string | undefined) => void;
}) {
  const query = useQuery(templateVersionQuery(versionId));
  if (query.isError && isApiError(query.error) && query.error.code === "NOT_FOUND") {
    return <NotFoundState />;
  }
  return (
    <QueryBoundary query={query} skeleton={<EditSkeleton />}>
      {(detail) => <EditView detail={detail} node={node} onNodeChange={onNodeChange} />}
    </QueryBoundary>
  );
}

function EditView({
  detail,
  node,
  onNodeChange,
}: {
  detail: TemplateVersionDetail;
  node: string | undefined;
  onNodeChange: (node: string | undefined) => void;
}) {
  const { t } = useTranslation(["admin", "app"]);
  const goTo = useGoTo();
  const compact = useBelowDesktop();
  const writes = useTemplateWrites(detail.id);
  const readOnly = detail.status === "published";
  const [adding, setAdding] = useState<NewNode | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [checked, setChecked] = useState<TemplateValidation | null>(null);

  const section = detail.sections.find((candidate) => candidate.id === node);
  const owning = detail.sections.find((candidate) =>
    candidate.questions.some((question) => question.id === node),
  );
  const question = owning?.questions.find((candidate) => candidate.id === node);
  const pseudo = isPseudoNode(node) ? node : undefined;
  const known = Boolean(section || question || pseudo);
  const targetSection = section ?? owning;

  const listPath = `/admin/templates?kind=${detail.kind}`;

  const move = (by: -1 | 1) => {
    const sections = detail.sections.map((s) => ({
      id: s.id,
      questionIds: s.questions.map((q) => q.id),
    }));
    if (section) {
      const index = sections.findIndex((s) => s.id === section.id);
      void trackDraftSave(() => writes.order.mutateAsync(swapped(sections, index, index + by)));
    } else if (owning && question) {
      const target = sections.find((s) => s.id === owning.id);
      if (!target) return;
      const index = target.questionIds.indexOf(question.id);
      target.questionIds = swapped(target.questionIds, index, index + by);
      void trackDraftSave(() => writes.order.mutateAsync(sections));
    }
  };

  const movable = (by: -1 | 1) => {
    if (readOnly) return false;
    if (section) {
      const index = detail.sections.indexOf(section);
      return index + by >= 0 && index + by < detail.sections.length;
    }
    if (owning && question) {
      const index = owning.questions.indexOf(question);
      return index + by >= 0 && index + by < owning.questions.length;
    }
    return false;
  };

  const remove = () => {
    const done = () => {
      setDeleting(false);
      onNodeChange(undefined);
    };
    const failed = (error: unknown) => {
      setDeleting(false);
      toasts.add({ title: errorText(t, error), variant: "negative" });
    };
    if (section) writes.deleteSection.mutate(section.id, { onSuccess: done, onError: failed });
    else if (question) {
      writes.deleteQuestion.mutate(question.id, { onSuccess: done, onError: failed });
    }
  };

  // The checks read the draft as the server has it, so edits still waiting for their pause go first.
  const publish = () =>
    void settleDraftSaves().then(() =>
      writes.validate.mutate(undefined, {
        onSuccess: setChecked,
        onError: (error) => toasts.add({ title: errorText(t, error), variant: "negative" }),
      }),
    );

  const title = t("admin:edit.title", {
    name: kindName(t, detail.kind),
    number: detail.versionNumber,
  });
  const deletingNode = writes.deleteSection.isPending || writes.deleteQuestion.isPending;

  let editor: React.ReactNode;
  if (section) {
    editor = (
      <SectionEditor
        key={section.id}
        versionId={detail.id}
        section={section}
        isPlan={detail.kind === "business_plan"}
        readOnly={readOnly}
      />
    );
  } else if (question) {
    editor = (
      <QuestionEditor key={question.id} detail={detail} question={question} readOnly={readOnly} />
    );
  } else if (pseudo === "ai-prompt") {
    editor = (
      <AiPromptEditor
        key={pseudo}
        versionId={detail.id}
        aiPrompt={detail.aiPrompt}
        readOnly={readOnly}
      />
    );
  } else if (pseudo === "cost-defaults") {
    editor = <CostDefaultsEditor key={pseudo} detail={detail} readOnly={readOnly} />;
  } else if (pseudo === "check-rules") {
    editor = <CheckRulesEditor key={pseudo} detail={detail} readOnly={readOnly} />;
  } else if (pseudo === "execution-presets") {
    editor = <ExecutionPresetsEditor key={pseudo} detail={detail} readOnly={readOnly} />;
  } else {
    editor = <Text tone="secondary">{t("admin:edit.none")}</Text>;
  }

  return (
    <>
      <ListDetailPattern
        header={
          <Stack gap="space-200">
            <Link href={listPath}>{t("admin:edit.back")}</Link>
            <Flex justify="between" align="center" gap="space-200" wrap>
              <Flex gap="space-200" align="center" wrap>
                <Heading level={1}>{title}</Heading>
                <Badge variant={readOnly ? "positive" : "notice"}>
                  {readOnly
                    ? t("admin:templates.status.published")
                    : t("admin:templates.status.draft")}
                </Badge>
              </Flex>
              <Flex gap="space-100" align="center" wrap>
                {readOnly ? null : (
                  <Button
                    variant="accent"
                    isPending={writes.validate.isPending}
                    pendingLabel={t("app:saving")}
                    onPress={publish}
                  >
                    {t("admin:edit.publish.button", { number: detail.versionNumber })}
                  </Button>
                )}
              </Flex>
            </Flex>
            {readOnly ? (
              <InlineAlert
                variant="informative"
                heading={t("admin:edit.readOnly.heading", { number: detail.versionNumber })}
              >
                <Stack gap="space-100">
                  <Text>{t("admin:edit.readOnly.body")}</Text>
                  <Flex>
                    <Button variant="secondary" onPress={() => goTo(listPath)}>
                      {t("admin:edit.readOnly.toList")}
                    </Button>
                  </Flex>
                </Stack>
              </InlineAlert>
            ) : null}
          </Stack>
        }
        detailOpen={compact && known}
        list={
          <Stack gap="space-200">
            {readOnly ? null : (
              <Flex gap="space-100" wrap>
                <Button variant="secondary" size="S" onPress={() => setAdding({ type: "section" })}>
                  <Plus aria-hidden />
                  {t("admin:edit.add.section")}
                </Button>
                <Button
                  variant="secondary"
                  size="S"
                  isDisabled={!targetSection}
                  onPress={() =>
                    targetSection &&
                    setAdding({
                      type: "question",
                      sectionId: targetSection.id,
                      sectionKey: targetSection.key,
                    })
                  }
                >
                  <Plus aria-hidden />
                  {t("admin:edit.add.question")}
                </Button>
                <Button
                  variant="secondary"
                  size="S"
                  aria-label={t("admin:edit.moveSelectedUp")}
                  isDisabled={!movable(-1)}
                  onPress={() => move(-1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  variant="secondary"
                  size="S"
                  aria-label={t("admin:edit.moveSelectedDown")}
                  isDisabled={!movable(1)}
                  onPress={() => move(1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  variant="secondary"
                  size="S"
                  aria-label={t("admin:edit.deleteSelected")}
                  isDisabled={!section && !question}
                  onPress={() => setDeleting(true)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </Flex>
            )}
            <TemplateTree detail={detail} selected={node} onSelect={onNodeChange} />
          </Stack>
        }
        detail={
          <Stack gap="space-300">
            {compact && known ? (
              <Flex>
                <Button variant="secondary" size="S" onPress={() => onNodeChange(undefined)}>
                  {t("admin:list.backToList")}
                </Button>
              </Flex>
            ) : null}
            {editor}
          </Stack>
        }
      />
      {adding ? (
        <NewNodeDialog
          versionId={detail.id}
          kind={detail.kind}
          node={adding}
          onClose={() => setAdding(null)}
          onCreated={(id) => {
            setAdding(null);
            onNodeChange(id);
          }}
        />
      ) : null}
      <AlertDialog
        isOpen={deleting}
        title={
          section
            ? t("admin:edit.delete.sectionTitle", { key: section.key })
            : t("admin:edit.delete.questionTitle", { key: question?.key ?? "" })
        }
        primaryActionLabel={t("admin:edit.delete.confirm")}
        cancelLabel={t("app:cancel")}
        onPrimaryAction={remove}
        onCancel={() => setDeleting(false)}
        onOpenChange={(open) => !open && !deletingNode && setDeleting(false)}
      >
        {section
          ? t("admin:edit.delete.sectionBody", { count: section.questions.length })
          : t("admin:edit.delete.questionBody")}
      </AlertDialog>
      {checked ? (
        <PublishDialog
          versionNumber={detail.versionNumber}
          result={checked}
          isPending={writes.publish.isPending}
          failure={writes.publish.error}
          onJump={onNodeChange}
          onPublish={() =>
            writes.publish.mutate(undefined, {
              onSuccess: () => {
                setChecked(null);
                toasts.add({
                  title: t("admin:edit.publish.done", { number: detail.versionNumber }),
                  variant: "positive",
                });
                goTo(listPath);
              },
            })
          }
          onClose={() => {
            writes.publish.reset();
            setChecked(null);
          }}
        />
      ) : null}
    </>
  );
}

/** An index outside the list leaves it as it was. */
function swapped<Item>(list: Item[], a: number, b: number): Item[] {
  const first = list[a];
  const second = list[b];
  if (first === undefined || second === undefined) return list;
  const next = [...list];
  next[a] = second;
  next[b] = first;
  return next;
}

function kindName(t: TFunction, kind: TemplateVersionDetail["kind"]) {
  switch (kind) {
    case "self_analysis":
      return t("admin:edit.kinds.self_analysis");
    case "validation":
      return t("admin:edit.kinds.validation");
    case "business_plan":
      return t("admin:edit.kinds.business_plan");
  }
}
