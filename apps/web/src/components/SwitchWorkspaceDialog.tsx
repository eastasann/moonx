import { formatCurrencyOption } from "@moonx/i18n";
import {
  CURRENCY_CODES,
  currencySchema,
  type WorkspaceCreate,
  workspaceNameSchema,
} from "@moonx/schemas";
import {
  Button,
  ButtonGroup,
  Dialog,
  Form,
  RowList,
  RowListItem,
} from "@moonx/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, unwrap } from "../lib/api";
import { useAppForm, useOneAtATime } from "../lib/form";
import { useIsOnline } from "../lib/online";
import { useSendThrough } from "../lib/send";
import { useFailureOnceClosed } from "./ideaActions";
import { ModalSendFailure } from "./ModalFailure";
import { refusedFieldsOf } from "./RowFields";
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
 * is empty or too long, Create cannot be pressed. A failure keeps what was typed and takes
 * the modals' rule (3.8 M7, 6.0.6 モーダルの共通の決まり, SDD 8.2): the network or an API
 * that is down as "Couldn't save" and Retry in place, a name the API refuses as "Couldn't
 * save" with 6.0.2's reason and under the field too until it changes, and anything else
 * unexpected, in the small dialog with its Ref, whose Close closes M7. Either Retry sends
 * what is typed again. Cancel, or M7 closed, while Create is on its way: the workspace is
 * made all the same if the send goes through, without opening it, and a failure says so
 * in a toast, whose Retry sends the same name and currency again and opens nothing either
 * (6.0.6「送っている間に閉じた送信の失敗」).
 */
function NewWorkspaceForm({
  onCancel,
  onClose,
}: {
  onCancel: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["app", "errors"]);
  // Offline, nothing can be sent: the fields stop taking input (6.0.6「オフライン」).
  const isOnline = useIsOnline();
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
  const sendThrough = useSendThrough();
  const post = (values: WorkspaceCreate) =>
    unwrap(api().api.v1.workspaces.post(values));
  // W0 made the user its Owner and its last workspace (SDD 5.5): M7's list, if open,
  // shows it.
  const made = () => queryClient.invalidateQueries({ queryKey: ["me"] });
  const failedOnceClosed = useFailureOnceClosed((values: WorkspaceCreate) =>
    sendThrough(() => post(values)).then(made),
  );
  const create = useMutation({
    mutationFn: post,
    // Here, not in `mutate`'s: they run after Cancel pressed while it was on its way.
    onSuccess: made,
    onError: failedOnceClosed,
  });
  // A second W0 would make a second workspace: a second submit waits for the first, so
  // the form stays submitting (Create keeps its spinner).
  const oneAtATime = useOneAtATime();
  const send = (values: WorkspaceCreate) =>
    oneAtATime(
      () =>
        new Promise<void>((resolve) => {
          create.mutate(values, {
            // Fires only while the form is still open: made after Cancel, or after M7
            // closed, the workspace does not open, and the user stays where they are
            // (6.0.6「送っている間に閉じた送信の失敗」). Create stays pending until its
            // 5 opens.
            onSuccess: (workspace) =>
              void navigate({
                to: "/w/$workspaceId",
                params: { workspaceId: workspace.id },
              }).finally(resolve),
            // The failure shows from the mutation's state below; a 401 has left the page.
            onError: () => resolve(),
          });
        }),
    );
  const failure = create.error;
  const isNameRefused = refusedFieldsOf(failure, ["name"]).length > 0;
  const form = useAppForm({
    defaultValues: { name: "", currency: DEFAULT_CURRENCY },
    listeners: {
      // The refusal was of the name as it was: once it changes, the failure is gone.
      // The form takes each render's options, so this reads the failure shown now.
      onChange: ({ fieldApi }) => {
        if (fieldApi.name === "name" && isNameRefused) create.reset();
      },
    },
    onSubmit: ({ value }) => send(value),
  });
  return (
    <form.AppForm>
      <Form
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
              rejection={isNameRefused ? t("errors:input.format") : undefined}
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
        {failure !== null && (
          <ModalSendFailure
            error={failure}
            onRetry={() => void form.handleSubmit()}
            isRetryDisabled={!isOnline || create.isPending}
            onClose={onClose}
          />
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
    </form.AppForm>
  );
}
