import { formatCount, formatList } from "@moonx/i18n";
import type {
  TemplateKind,
  TemplateMigrationPreview,
  TemplateRef,
} from "@moonx/schemas";
import {
  AlertBanner,
  Button,
  ButtonGroup,
  DescriptionList,
  DescriptionListItem,
  Dialog,
  Heading,
  InlineAlert,
  Link,
  RowList,
  RowListItem,
  Stack,
  Text,
  ToastQueue,
} from "@moonx/ui-web";
import {
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, unwrap } from "../lib/api";
import { useOneAtATime } from "../lib/form";
import { questionLabel } from "../lib/item-labels";
import { useIsOnline } from "../lib/online";
import {
  aiKey,
  commentsKey,
  historyKey,
  templateMigrationPreviewQuery,
  workspaceKey,
} from "../lib/queries";
import { ModalSendFailure } from "./ModalFailure";
import { FailureState, LoadingBlock } from "./states";
import { dashboardHref, useModal, useWorkspace } from "./workspace";

/** How long a toast without an action stays: the shortest 4.5 Toast allows. */
const TOAST_MS = 5000;

/** What a template migration moves (SDD 5.12): a self-analysis, validation or plan. */
export interface TemplateTarget {
  kind: TemplateKind;
  id: string;
}

/** M8's `about` (SDD 4章): `<templateKind>:<targetId>`. */
const aboutOf = ({ kind, id }: TemplateTarget) => `${kind}:${id}`;

/**
 * Whether `about` names the screen's own self-analysis, validation or plan (SDD 4章): the
 * kind as written, the id in any case, as the API reads ids.
 */
function isAboutTarget(about: string | undefined, target: TemplateTarget) {
  const separator = about?.indexOf(":") ?? -1;
  if (about === undefined || separator < 0) return false;
  return (
    about.slice(0, separator) === target.kind &&
    about.slice(separator + 1).toLowerCase() === target.id.toLowerCase()
  );
}

/**
 * Whether M8 is open over the screen (SDD 4章): `?modal=update-template` about the
 * screen's own `target`, for someone who may migrate it (`canMigrate`); nothing for an
 * `about` missing or naming something else. Decided as it opens: once open it stays while
 * its URL does, so a refusal it gets (the idea archived meanwhile) shows in it, instead
 * of M8 going and leaving its URL to open it again on Restore.
 */
export function useIsTemplateUpdateOpen(
  modal: string | undefined,
  about: string | undefined,
  target: TemplateTarget,
  canMigrate: boolean,
): boolean {
  const [wasOpen, setOpen] = useState(false);
  const isOpen =
    modal === "update-template" &&
    isAboutTarget(about, target) &&
    (canMigrate || wasOpen);
  if (isOpen !== wasOpen) setOpen(isOpen);
  return isOpen;
}

const isCode = (error: unknown, code: string) =>
  error instanceof ApiError && error.code === code;

/**
 * The band of 10, 13 and 20 while a newer template version is published (design-spec
 * 6.0.1・6.0.7, d1-moon.html .banner): the version the answers stay on, and Update
 * template, which opens M8. Nothing while the pinned version is the newest, or for
 * someone who may not migrate (`canMigrate`: Owners and Members, a self-analysis its
 * owner, and not while archived).
 */
export function useTemplateBanner(
  template: TemplateRef | undefined,
  target: TemplateTarget | undefined,
  canMigrate: boolean,
): ReactNode {
  const { t } = useTranslation(["app"]);
  const modals = useModal();
  if (
    template === undefined ||
    target === undefined ||
    template.newerVersion === null ||
    !canMigrate
  ) {
    return undefined;
  }
  return (
    <AlertBanner
      title={t("app:templateUpdate.bannerTitle")}
      action={
        <Link
          onPress={() =>
            modals.open("update-template", { about: aboutOf(target) })
          }
        >
          {t("app:templateUpdate.action")}
        </Link>
      }
    >
      {t("app:templateUpdate.bannerBody", { version: template.versionNumber })}
    </AlertBanner>
  );
}

/** Opens M8 about `target` (the ⋯ of 13 and 20, design-spec 6.1・6.12). */
export function useOpenTemplateUpdate(): (target: TemplateTarget) => void {
  const modals = useModal();
  return (target) => modals.open("update-template", { about: aboutOf(target) });
}

/** Whether the component is still on screen, for what settles after it may have gone. */
function useIsOpen() {
  const isOpen = useRef(true);
  useEffect(() => {
    isOpen.current = true;
    return () => {
      isOpen.current = false;
    };
  }, []);
  return isOpen;
}

/**
 * What moving to the new version does (design-spec 6.0.7): how many answers carry over,
 * how many questions it adds and, for a validation, the cost rows it adds; then the
 * questions it no longer has, each with whether it was answered, as those answers stay
 * saved but hidden.
 */
function PreviewBody({
  kind,
  preview,
}: {
  kind: TemplateKind;
  preview: TemplateMigrationPreview;
}) {
  const { t } = useTranslation(["app"]);
  const to = preview.to.versionNumber;
  const hiddenTitle = t("app:templateUpdate.hidden", { version: to });
  return (
    <Stack gap="space-400">
      <Text elementType="p">
        {t("app:templateUpdate.lead", {
          from: preview.from.versionNumber,
          to,
        })}
      </Text>
      <DescriptionList>
        <DescriptionListItem label={t("app:templateUpdate.carried")}>
          {formatCount(preview.carried)}
        </DescriptionListItem>
        <DescriptionListItem label={t("app:templateUpdate.added")}>
          {formatCount(preview.addedQuestions)}
        </DescriptionListItem>
        {kind === "validation" && (
          <DescriptionListItem label={t("app:templateUpdate.addedCostRows")}>
            {preview.addedCostRows.length === 0
              ? t("app:templateUpdate.none")
              : formatList(preview.addedCostRows)}
          </DescriptionListItem>
        )}
      </DescriptionList>
      <Stack gap="space-100">
        <Heading level={3} variant="label">
          {hiddenTitle}
        </Heading>
        {preview.hiddenQuestions.length === 0 ? (
          <Text tone="secondary" elementType="p">
            {t("app:templateUpdate.hiddenNone", { version: to })}
          </Text>
        ) : (
          <>
            <Text tone="secondary" elementType="p">
              {t("app:templateUpdate.hiddenNote")}
            </Text>
            <RowList aria-label={hiddenTitle}>
              {preview.hiddenQuestions.map((question) => (
                <RowListItem
                  key={question.questionKey}
                  end={
                    question.hasAnswer
                      ? t("app:templateUpdate.answered")
                      : t("app:templateUpdate.notAnswered")
                  }
                >
                  {questionLabel(question.questionKey, question.title)}
                </RowListItem>
              ))}
            </RowList>
          </>
        )}
      </Stack>
    </Stack>
  );
}

/** M8's shape while T1 answers, then the wait's own state (design-spec 6.0.6). */
function PreviewSkeleton({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(["app"]);
  return (
    <LoadingBlock onRetry={onRetry}>
      <Stack gap="space-400">
        <Text elementType="p">{t("app:templateUpdate.title")}</Text>
        <DescriptionList>
          <DescriptionListItem label={t("app:templateUpdate.carried")}>
            {t("app:templateUpdate.none")}
          </DescriptionListItem>
          <DescriptionListItem label={t("app:templateUpdate.added")}>
            {t("app:templateUpdate.none")}
          </DescriptionListItem>
        </DescriptionList>
      </Stack>
    </LoadingBlock>
  );
}

/**
 * M8 Update template (design-spec 3.8・6.0.7, SDD 5.12): what moving to the newest
 * published version keeps and hides (T1), read each time it opens, and Update template
 * (T2), after which the screen and its history read again and the band goes. Someone
 * else having moved it first says "You're already on the latest template" with Close
 * alone; a newer version published and moved to meanwhile shows what M8 would do now.
 * Large; a full-screen sheet on a phone.
 *
 * @param dataKeys What the screen reads that the migration changes (its questions,
 *   progress and checks), besides the workspace, the comments and AI round trips.
 */
export function TemplateUpdateDialog({
  target,
  dataKeys,
  onClose,
}: {
  target: TemplateTarget;
  dataKeys: readonly QueryKey[];
  onClose: () => void;
}) {
  const { t } = useTranslation(["app"]);
  const { me, workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const isOpen = useIsOpen();
  const preview = useQuery(
    templateMigrationPreviewQuery(target.kind, target.id),
  );
  const changed = () =>
    Promise.all(
      [
        ...dataKeys,
        workspaceKey(workspace.id),
        commentsKey,
        // A move or an archive by someone else is in the history too.
        historyKey,
        aiKey(
          target.kind,
          target.kind === "self_analysis" ? undefined : target.id,
        ),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  const migrate = useMutation({
    mutationFn: (toVersionId: string) =>
      unwrap(
        api().api.v1["template-migrations"].post({
          targetType: target.kind,
          targetId: target.id,
          toVersionId,
        }),
      ),
    onSuccess: async ({ template }) => {
      await changed();
      ToastQueue.neutral(
        t("app:templateUpdate.updated", { version: template.versionNumber }),
        { timeout: TOAST_MS },
      );
      // Back closed M8 meanwhile: closing again would leave the screen.
      if (isOpen.current) onClose();
    },
    onError: (error) => {
      if (isCode(error, "ALREADY_LATEST") || isCode(error, "ARCHIVED")) {
        // Moved by someone else, or archived: the screen and its band follow.
        void changed();
      } else if (isCode(error, "VALIDATION_FAILED")) {
        // `toVersionId` is no longer newer than the pinned version: someone moved it there
        // while a newer one was published (SDD 5.12). What M8 would do now, to decide again.
        void preview.refetch();
        void changed();
      }
    },
  });
  const isLatest =
    isCode(preview.error, "ALREADY_LATEST") ||
    isCode(migrate.error, "ALREADY_LATEST");
  // Opened from a band someone else's migration has since made stale: the band goes.
  const isLatestOnOpen = isCode(preview.error, "ALREADY_LATEST");
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as T1 first says so; `changed` is a new function on every render, and the reads it starts render this again.
  useEffect(() => {
    if (isLatestOnOpen) void changed();
  }, [isLatestOnOpen]);
  // A second press before the first answer would migrate twice.
  const oneAtATime = useOneAtATime();
  const submit = () => {
    const toVersionId = preview.data?.to.versionId;
    if (toVersionId === undefined) return;
    void oneAtATime(() =>
      migrate.mutateAsync(toVersionId).then(
        () => {},
        // Shown from the mutation's state.
        () => {},
      ),
    );
  };
  const isChanged = isCode(migrate.error, "VALIDATION_FAILED");
  const sendError =
    migrate.error === null ||
    isCode(migrate.error, "ALREADY_LATEST") ||
    isChanged
      ? null
      : migrate.error;
  let body: ReactNode;
  if (isLatest) {
    body = <Text elementType="p">{t("app:templateUpdate.latest")}</Text>;
  } else if (preview.isError) {
    // Before the preview it had, which no longer says what a move would do.
    body = (
      <FailureState
        error={preview.error}
        onRetry={() => void preview.refetch()}
        dashboardHref={dashboardHref(me)}
        headingLevel={3}
        size="S"
      />
    );
  } else if (preview.data !== undefined) {
    body = (
      <Stack gap="space-400">
        {isChanged && (
          <InlineAlert variant="notice">
            {t("app:templateUpdate.changed")}
          </InlineAlert>
        )}
        <PreviewBody kind={target.kind} preview={preview.data} />
      </Stack>
    );
  } else {
    body = <PreviewSkeleton onRetry={() => void preview.refetch()} />;
  }
  return (
    <Dialog
      isOpen
      // A send on its way finishes first: closing then would leave twice (useModal).
      onOpenChange={(open) => {
        if (!open && !migrate.isPending) onClose();
      }}
      size="L"
      density="spacious"
      title={t("app:templateUpdate.title")}
      buttons={
        isLatest ? (
          <ButtonGroup align="end">
            <Button variant="primary" onPress={onClose}>
              {t("app:templateUpdate.close")}
            </Button>
          </ButtonGroup>
        ) : (
          <ButtonGroup align="end">
            <Button
              variant="secondary"
              onPress={onClose}
              isDisabled={migrate.isPending}
            >
              {t("app:templateUpdate.cancel")}
            </Button>
            <Button
              variant="primary"
              onPress={submit}
              isPending={migrate.isPending}
              // Only on what T1 says now it moves to (6.0.6: no decision before then).
              isDisabled={
                !isOnline ||
                preview.data === undefined ||
                preview.isError ||
                preview.isFetching
              }
            >
              {t("app:templateUpdate.action")}
            </Button>
          </ButtonGroup>
        )
      }
    >
      <Stack gap="space-400">
        {body}
        {!isLatest && sendError !== null && (
          <ModalSendFailure
            error={sendError}
            onRetry={submit}
            isRetryDisabled={!isOnline || migrate.isPending}
            onClose={onClose}
          />
        )}
      </Stack>
    </Dialog>
  );
}
