import { formatCurrencyOption } from "@moonx/i18n";
import {
  CURRENCY_CODES,
  currencySchema,
  type WorkspaceCreate,
  workspaceNameSchema,
} from "@moonx/schemas";
import {
  AlertDialog,
  Button,
  ButtonGroup,
  Dialog,
  Flex,
  Form,
  InlineAlert,
  RowList,
  RowListItem,
  Text,
} from "@moonx/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, unwrap } from "../lib/api";
import { useAppForm } from "../lib/form";
import { useIsOnline } from "../lib/online";
import { isTransient } from "../lib/query";
import { reportOnce } from "./states";
import { useWorkspace } from "./workspace";

/** W0's currency when the user picks none (design-spec 5章「ワークスペースの作成」). */
const DEFAULT_CURRENCY = "PHP";

/**
 * M7 Switch workspace (design-spec 3.8・5章): the workspaces the user belongs to, each
 * opening its 5 Dashboard, and New workspace, which makes one with the user as Owner and
 * opens its 5. Small, a tray on a phone.
 */
export function SwitchWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["app"]);
  const [isCreating, setCreating] = useState(false);
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable
      size="S"
      density="spacious"
      title={
        isCreating
          ? t("app:newWorkspace.title")
          : t("app:switchWorkspace.title")
      }
      buttons={
        isCreating ? undefined : (
          <ButtonGroup align="end">
            <Button variant="secondary" onPress={() => setCreating(true)}>
              <Plus />
              {t("app:switchWorkspace.newWorkspace")}
            </Button>
          </ButtonGroup>
        )
      }
    >
      {isCreating ? (
        <NewWorkspaceForm
          onCancel={() => setCreating(false)}
          onClose={onClose}
        />
      ) : (
        <WorkspaceList />
      )}
    </Dialog>
  );
}

function WorkspaceList() {
  const { t } = useTranslation(["app", "common"]);
  const { me, workspace: current } = useWorkspace();
  return (
    <RowList aria-label={t("app:switchWorkspace.workspaces")}>
      {me.memberships.map(({ workspace, role }) => {
        const isCurrent = workspace.id === current.id;
        const roleName = t(`common:role.${role}`);
        return (
          <RowListItem
            key={workspace.id}
            href={isCurrent ? undefined : `/w/${workspace.id}`}
            description={
              workspace.isPersonal
                ? `${t("app:switchWorkspace.personal")}${t("app:separator")}${roleName}`
                : roleName
            }
            end={isCurrent ? t("app:switchWorkspace.current") : undefined}
          >
            {workspace.name}
          </RowListItem>
        );
      })}
    </RowList>
  );
}

/**
 * New workspace: a name and a currency (design-spec 6.0.8), sent with W0. While the name
 * is empty or too long, Create cannot be pressed. A failure keeps what was typed: one of
 * the network or of an API that is down offers Retry in place; any other is unexpected,
 * in the small dialog with its Ref, whose Close closes M7 (6.0.6 モーダルの共通の決まり,
 * SDD 8.2).
 */
function NewWorkspaceForm({
  onCancel,
  onClose,
}: {
  onCancel: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["app"]);
  // Offline, nothing can be sent: the fields stop taking input (6.0.6「オフライン」).
  const isOnline = useIsOnline();
  const formId = useId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currencies = useMemo(
    () =>
      CURRENCY_CODES.map((code) => ({
        id: code,
        label: formatCurrencyOption(code),
      })),
    [],
  );
  const create = useMutation({
    mutationFn: (values: WorkspaceCreate) =>
      unwrap(api().api.v1.workspaces.post(values)),
    onSuccess: async (workspace) => {
      // W0 made the user its Owner and its last workspace (SDD 5.5).
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await navigate({
        to: "/w/$workspaceId",
        params: { workspaceId: workspace.id },
      });
    },
  });
  // One send at a time: after a first attempt TanStack Form lets a submit through while
  // the last one is still out, and a second W0 would make a second workspace. A second
  // submit waits for the first, so the form stays submitting (Create keeps its spinner).
  const sending = useRef<Promise<void> | null>(null);
  const form = useAppForm({
    defaultValues: { name: "", currency: DEFAULT_CURRENCY },
    onSubmit: async ({ value }) => {
      sending.current ??= create
        .mutateAsync(value)
        .then(
          () => {},
          () => {
            // Shown from the mutation's state below; a 401 has left the page already.
          },
        )
        .finally(() => {
          sending.current = null;
        });
      await sending.current;
    },
  });
  const failure = create.error;
  const isUnexpected =
    failure !== null &&
    !(
      failure instanceof ApiError &&
      (isTransient(failure) || failure.status === 401)
    );
  // The API's request id, or the Sentry event of the Web's own failure (SDD 8.2).
  const reference = useMemo(
    () =>
      !isUnexpected
        ? null
        : failure instanceof ApiError
          ? failure.requestId
          : reportOnce(failure),
    [isUnexpected, failure],
  );
  const canRetry = isOnline && !create.isPending;
  return (
    <form.AppForm>
      <Form
        id={formId}
        onSubmit={() => {
          void form.handleSubmit();
        }}
      >
        <form.AppField
          name="name"
          validators={{
            onMount: workspaceNameSchema,
            onChange: workspaceNameSchema,
          }}
        >
          {(field) => (
            <field.TextField
              label={t("app:newWorkspace.name")}
              isRequired
              isReadOnly={!isOnline}
              autoFocus
            />
          )}
        </form.AppField>
        <form.AppField
          name="currency"
          validators={{ onMount: currencySchema, onChange: currencySchema }}
        >
          {(field) => (
            <field.Picker
              label={t("app:newWorkspace.currency")}
              items={currencies}
              isRequired
              isDisabled={!isOnline}
            />
          )}
        </form.AppField>
        {failure !== null && !isUnexpected && (
          <InlineAlert variant="negative">
            <Flex gap="space-200" wrap alignItems="center">
              <Text>{t("app:newWorkspace.couldNotSave")}</Text>
              <Button
                variant="secondary"
                size="S"
                type="submit"
                form={formId}
                isDisabled={!canRetry}
              >
                {t("app:state.retry")}
              </Button>
            </Flex>
          </InlineAlert>
        )}
        <ButtonGroup align="end">
          <Button variant="secondary" onPress={onCancel}>
            {t("app:newWorkspace.cancel")}
          </Button>
          <form.SubmitButton isDisabled={!isOnline}>
            {t("app:newWorkspace.create")}
          </form.SubmitButton>
        </ButtonGroup>
      </Form>
      {isUnexpected && (
        <AlertDialog
          isOpen
          variant="error"
          size="S"
          title={t("app:state.unexpected")}
          primaryActionLabel={t("app:state.retry")}
          cancelLabel={t("app:state.close")}
          onPrimaryAction={() => void form.handleSubmit()}
          isPrimaryActionDisabled={!canRetry}
          onCancel={onClose}
        >
          {reference === null
            ? ""
            : t("app:state.ref", { ref: reference.slice(0, 8) })}
        </AlertDialog>
      )}
    </form.AppForm>
  );
}
