import { formatDate } from "@moonx/i18n";
import {
  ActionMenu,
  Button,
  Flex,
  Heading,
  InlineAlert,
  Link,
  MenuItem,
  Stack,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ConflictDialog } from "../../components/ConflictDialog";
import { planHeaderFormSchema } from "../../forms/plan";
import { planKey } from "../../lib/ai-exchange";
import { errorText } from "../../lib/error-text";
import { validate } from "../../lib/form";
import { IDEAS_KEY } from "../../lib/idea-actions";
import { linkTargetPath } from "../../lib/link-target";
import { useGoTo } from "../../lib/navigate";
import { useOverlay } from "../../lib/overlay";
import { type PlanHome, planPaths } from "../../lib/plans";
import { useSavedItem } from "../../lib/use-saved-item";
import { validationHomeQuery } from "../../lib/validation-home";
import { decisionText } from "../validation-home/decision-text";
import type { PlanAccess } from "./access";
import { usePlanArchive } from "./actions";
import { PlanSwitcher } from "./PlanSwitcher";
import { RenameDialog } from "./RenameDialog";

interface Values {
  businessName: string;
  preparedBy: string;
}
type Field = keyof Values;

/** The header as the 409 of P2 PATCH carries it in `current.value`. */
const currentValueSchema = z.object({
  name: z.string(),
  businessName: z.string(),
  preparedBy: z.string(),
});

const FIELDS: readonly Field[] = ["businessName", "preparedBy"];

/**
 * The header of the plan home (design-spec 6.12): the idea it belongs to, the plan switcher, the
 * version state, the actions, and Business Name and Prepared By edited in place. Name, Business
 * Name and Prepared By are one item with one lock, so all three save through one saved item.
 */
export function PlanHeader({
  plan,
  workspaceId,
  ideaId,
  access,
}: {
  plan: PlanHome;
  workspaceId: string;
  ideaId: string;
  access: PlanAccess;
}) {
  const { t } = useTranslation(["planHome", "validation", "app", "form"]);
  const goTo = useGoTo();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { openModal } = useOverlay();
  const archive = usePlanArchive(plan.id);
  const ideaName = useQuery(validationHomeQuery(ideaId)).data?.idea.name;
  const paths = planPaths(workspaceId, ideaId, plan.id);
  const viewing = plan.viewingVersion;
  const [values, setValues] = useState<Values>({
    businessName: plan.businessName,
    preparedBy: plan.preparedBy,
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [renaming, setRenaming] = useState(false);
  // True from the rename submit until its save comes back, so a save of another field that
  // finishes meanwhile does not close the sheet. The state drives the button, the ref the callbacks.
  const awaitingRename = useRef(false);
  const [renamePending, setRenamePending] = useState(false);
  const endRename = () => {
    awaitingRename.current = false;
    setRenamePending(false);
    setRenaming(false);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: planKey(plan.id) });
    void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
    // The breadcrumb reads the name from the route's loader.
    void router.invalidate();
  };

  const item = useSavedItem({
    itemKey: `plan:${plan.id}`,
    method: "PATCH",
    url: `/api/v1/plans/${plan.id}`,
    lockVersion: plan.lockVersion,
    isReadOnly: !access.canEditLatest,
    onSaved: () => {
      if (awaitingRename.current) endRename();
      refresh();
    },
    onSentElsewhere: refresh,
    onAdopt: (current) => {
      const theirs = currentValueSchema.safeParse(current.value);
      if (theirs.success) {
        setValues({ businessName: theirs.data.businessName, preparedBy: theirs.data.preparedBy });
      }
      setErrors({});
      endRename();
      refresh();
    },
    onRestore: (patch) => {
      setValues((prev) => ({
        businessName:
          typeof patch.businessName === "string" ? patch.businessName : prev.businessName,
        preparedBy: typeof patch.preparedBy === "string" ? patch.preparedBy : prev.preparedBy,
      }));
    },
  });

  const change = (field: Field, value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    const message = validate(planHeaderFormSchema, t)({ value: next })?.fields[field];
    setErrors((prev) => ({ ...prev, [field]: message }));
    // What waits from before this keystroke is the last value that passed; it goes out now so the
    // timer cannot send it after the field has become invalid.
    if (message) void item.flush();
    else item.save({ [field]: value.trim() });
  };

  const failure = item.failure;
  const theirs = item.conflict ? currentValueSchema.safeParse(item.conflict.value) : null;
  const headerText = (value: Values) =>
    [
      t("planHome:home.readOnlyFields.businessName", { name: value.businessName }),
      t("planHome:home.readOnlyFields.preparedBy", { name: value.preparedBy }),
    ].join("\n");

  const version = plan.latestVersion
    ? t(
        plan.hasChangesSinceVersion
          ? "planHome:home.version.withChanges"
          : "planHome:home.version.saved",
        {
          name: plan.latestVersion.name,
        },
      )
    : t("planHome:home.version.none");
  const ideaPath = linkTargetPath({ screen: 13, workspaceId, ideaId });
  const pitchPath = viewing
    ? `${paths.pitch}?${new URLSearchParams({ version: viewing.id })}`
    : paths.pitch;
  const showMenu = access.isEditor && viewing === null;

  const onMenuAction = (key: string | number) => {
    if (key === "rename") setRenaming(true);
    else if (key === "archive") archive.mutate(true);
    else if (key === "restore") archive.mutate(false);
  };

  return (
    <Stack gap="space-200">
      {ideaPath ? (
        <Link href={ideaPath}>
          {ideaName
            ? t("planHome:home.ideaLink", { name: ideaName })
            : t("planHome:home.ideaLinkFallback")}
        </Link>
      ) : null}
      <Flex gap="space-200" align="center" wrap>
        <Heading level={1}>{plan.name}</Heading>
        <PlanSwitcher
          plan={plan}
          workspaceId={workspaceId}
          ideaId={ideaId}
          canAddPlan={access.canAddPlan}
        />
        <Text as="span" tone="secondary">
          {version}
        </Text>
      </Flex>
      {plan.latestDecision && plan.latestDecision !== "proceed" ? (
        <InlineAlert
          variant="notice"
          role="note"
          heading={t("planHome:home.latestDecision", {
            decision: decisionText(t, plan.latestDecision),
          })}
        />
      ) : null}
      {plan.archived ? (
        <InlineAlert variant="neutral" heading={t("planHome:home.archivedBanner.heading")}>
          <Stack gap="space-100">
            <Text>{t("planHome:home.archivedBanner.body")}</Text>
            {access.canToggleArchive ? (
              <Flex>
                <Button
                  variant="secondary"
                  isPending={archive.isPending}
                  pendingLabel={t("app:saving")}
                  onPress={() => archive.mutate(false)}
                >
                  {t("planHome:home.archivedBanner.restore")}
                </Button>
              </Flex>
            ) : null}
          </Stack>
        </InlineAlert>
      ) : null}
      {viewing ? (
        <InlineAlert
          variant="informative"
          heading={t("planHome:home.viewing.heading", { name: viewing.name })}
        >
          <Stack gap="space-100">
            <Text>{t("planHome:home.viewing.body")}</Text>
            <Link href={paths.home}>{t("planHome:home.viewing.back")}</Link>
          </Stack>
        </InlineAlert>
      ) : null}
      {archive.error ? (
        <InlineAlert variant="negative" heading={errorText(t, archive.error)} />
      ) : null}
      {failure && !renaming ? (
        <InlineAlert
          variant="negative"
          heading={failure.willRetry ? t("form:saveFailed") : errorText(t, failure.error)}
        >
          <Flex gap="space-100" align="center" wrap>
            <Button
              variant="secondary"
              size="S"
              onPress={() =>
                item.retry(
                  Object.assign(
                    {},
                    ...FIELDS.filter((field) => !errors[field]).map((field) => ({
                      [field]: values[field].trim(),
                    })),
                  ),
                )
              }
            >
              {t("form:retry")}
            </Button>
          </Flex>
        </InlineAlert>
      ) : null}
      <Flex gap="space-100" align="center" wrap>
        {access.canEditLatest ? (
          <>
            <Button variant="secondary" onPress={() => openModal("save-version")}>
              {t("planHome:home.actions.saveVersion")}
            </Button>
            <Button variant="accent" onPress={() => openModal("go-no-go")}>
              {t("planHome:home.actions.recordGoNoGo")}
            </Button>
          </>
        ) : null}
        <Button variant="secondary" onPress={() => goTo(pitchPath)}>
          {t("planHome:home.actions.pitchDeck")}
        </Button>
        {showMenu ? (
          <ActionMenu label={t("planHome:home.actions.more")} onAction={onMenuAction}>
            {access.canChange ? (
              <MenuItem id="rename">{t("planHome:home.menu.rename")}</MenuItem>
            ) : null}
            {access.canChange ? (
              <MenuItem
                id="ai-export"
                href={`/w/${workspaceId}/ai/export?source=business_plan&id=${plan.id}`}
              >
                {t("planHome:home.menu.aiExport")}
              </MenuItem>
            ) : null}
            {access.canChange ? (
              <MenuItem
                id="ai-import"
                href={`/w/${workspaceId}/ai/import?target=business_plan&id=${plan.id}`}
              >
                {t("planHome:home.menu.aiImport")}
              </MenuItem>
            ) : null}
            {access.canToggleArchive && !plan.archived ? (
              <MenuItem id="archive">{t("planHome:home.menu.archive")}</MenuItem>
            ) : null}
            {access.canToggleArchive && plan.archived ? (
              <MenuItem id="restore">{t("planHome:home.menu.restore")}</MenuItem>
            ) : null}
          </ActionMenu>
        ) : null}
      </Flex>
      {access.canEditLatest ? (
        <Stack gap="space-100">
          <Flex gap="space-200" wrap>
            <TextField
              label={t("planHome:home.fields.businessName")}
              isRequired
              value={values.businessName}
              errorMessage={errors.businessName}
              isInvalid={Boolean(errors.businessName)}
              onChange={(value) => change("businessName", value)}
              onBlur={() => void item.flush()}
            />
            <TextField
              label={t("planHome:home.fields.preparedBy")}
              isRequired
              value={values.preparedBy}
              errorMessage={errors.preparedBy}
              isInvalid={Boolean(errors.preparedBy)}
              onChange={(value) => change("preparedBy", value)}
              onBlur={() => void item.flush()}
            />
          </Flex>
          <Text variant="caption" tone="secondary">
            {t("planHome:home.date.updated", { date: formatDate(plan.date, access.timeZone) })}
          </Text>
        </Stack>
      ) : (
        <Flex gap="space-200" align="center" wrap>
          <Text>{t("planHome:home.readOnlyFields.businessName", { name: plan.businessName })}</Text>
          <Text>{t("planHome:home.readOnlyFields.preparedBy", { name: plan.preparedBy })}</Text>
          <Text variant="caption" tone="secondary">
            {viewing
              ? t("planHome:home.date.saved", { date: formatDate(plan.date, access.timeZone) })
              : t("planHome:home.date.updated", { date: formatDate(plan.date, access.timeZone) })}
          </Text>
        </Flex>
      )}
      {renaming ? (
        <RenameDialog
          currentName={plan.name}
          isPending={renamePending && failure === null}
          failure={failure?.error ?? null}
          onSubmit={(name) => {
            awaitingRename.current = true;
            setRenamePending(true);
            item.save({ name }, { delay: 0 });
          }}
          onClose={endRename}
        />
      ) : null}
      <ConflictDialog
        current={item.conflict}
        itemName={t("planHome:home.conflictItem")}
        theirText={theirs?.success ? headerText(theirs.data) : null}
        mineText={headerText(values)}
        onLoadTheirs={item.loadTheirs}
        onKeepMine={item.keepMine}
      />
    </Stack>
  );
}
