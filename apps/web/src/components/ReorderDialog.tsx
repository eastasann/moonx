import {
  ActionButton,
  Button,
  ButtonGroup,
  Dialog,
  Flex,
  InlineAlert,
  RowList,
  RowListItem,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../lib/api";
import { useIsOnline } from "../lib/online";
import { ModalSendFailure } from "./ModalFailure";

/** A row of the list being ordered: its id and the words it is known by. */
export interface ReorderItem {
  id: string;
  label: string;
}

/** V17's refusal of ids that are no longer the list's every row (SDD 5.7). */
const isListChanged = (error: unknown) =>
  error instanceof ApiError &&
  error.code === "VALIDATION_FAILED" &&
  Array.isArray(error.detail.details) &&
  (error.detail.details as { path?: unknown }[]).some(
    ({ path }) => path === "ids",
  );

/**
 * "Reorder" of a row's ⋯ (design-spec 6.10: 15's cards, 16's assumptions and risks): the
 * rows as they stood when it opened, each moved up or down by its buttons, then Save
 * order sends the new order at once (SDD 5.7 V17). Large; a full sheet on a phone (3.8).
 * Save order waits for a change, so an order left as it was is not saved (it would turn
 * 16's risks to an order by hand). If someone added or deleted a row meanwhile, V17
 * refuses the ids: the list is read again and the order starts from it. Other failures
 * keep the order, as a modal's do.
 */
export function ReorderDialog({
  title,
  items,
  send,
  reload,
  onClose,
}: {
  title: string;
  /** The rows in their order when the dialog opens. */
  items: readonly ReorderItem[];
  /** Sends the ids of every row in the new order (V17). */
  send: (ids: string[]) => Promise<void>;
  /** Reads the list again, after V17 found it changed: its rows in their order. */
  reload: () => Promise<readonly ReorderItem[]>;
  onClose: () => void;
}) {
  const { t } = useTranslation(["validation"]);
  const isOnline = useIsOnline();
  const prefix = useId();
  const [rows, setRows] = useState(items);
  const [order, setOrder] = useState(() => items.map(({ id }) => id));
  const [wasReloaded, setReloaded] = useState(false);
  const [reloadFailure, setReloadFailure] = useState<unknown>(null);
  const save = useMutation({
    mutationFn: send,
    onSuccess: onClose,
    onError: (error) => {
      if (!isListChanged(error)) return;
      reload().then(
        (fresh) => {
          setRows(fresh);
          setOrder(fresh.map(({ id }) => id));
          setReloaded(true);
          save.reset();
        },
        // Not read again: its failure shows in place of the refusal, and Retry sends
        // the order, which V17 refuses again until the list is read.
        setReloadFailure,
      );
    },
  });
  const failure =
    reloadFailure ??
    (save.error !== null && !isListChanged(save.error) ? save.error : null);
  const isMoved = order.some((id, index) => id !== rows[index]?.id);
  const label = (id: string) => rows.find((row) => row.id === id)?.label ?? "";
  const buttonId = (id: string, step: -1 | 1) =>
    `${prefix}-${id}-${step === -1 ? "up" : "down"}`;
  const move = (id: string, step: -1 | 1) => {
    const from = order.indexOf(id);
    const to = from + step;
    const other = order[to];
    if (other === undefined) return;
    const next = [...order];
    next[to] = id;
    next[from] = other;
    setOrder(next);
    save.reset();
    setReloadFailure(null);
    // Focus follows the row; at the end of the list its other button takes it.
    const atEnd = to === 0 || to === next.length - 1;
    requestAnimationFrame(() =>
      document
        .getElementById(
          buttonId(
            id,
            atEnd && (to === 0 ? step === -1 : step === 1)
              ? (-step as -1 | 1)
              : step,
          ),
        )
        ?.focus(),
    );
  };
  const submit = () => {
    if (save.isPending) return;
    setReloadFailure(null);
    save.mutate(order);
  };
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen && !save.isPending) onClose();
      }}
      isDismissable
      size="L"
      title={title}
      buttons={
        <ButtonGroup align="end">
          <Button
            variant="secondary"
            onPress={onClose}
            isDisabled={save.isPending}
          >
            {t("validation:reorder.cancel")}
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            isDisabled={!isOnline || !isMoved}
            isPending={save.isPending}
          >
            {t("validation:reorder.save")}
          </Button>
        </ButtonGroup>
      }
    >
      <Stack gap="space-300">
        {wasReloaded && (
          <InlineAlert variant="notice">
            {t("validation:reorder.listChanged")}
          </InlineAlert>
        )}
        <RowList ordered aria-label={title}>
          {order.map((id, index) => (
            <RowListItem
              key={id}
              end={
                <Flex gap="space-50">
                  <ActionButton
                    id={buttonId(id, -1)}
                    isQuiet
                    size="S"
                    aria-label={t("validation:reorder.up", { item: label(id) })}
                    isDisabled={index === 0 || save.isPending}
                    onPress={() => move(id, -1)}
                  >
                    <ArrowUp />
                  </ActionButton>
                  <ActionButton
                    id={buttonId(id, 1)}
                    isQuiet
                    size="S"
                    aria-label={t("validation:reorder.down", {
                      item: label(id),
                    })}
                    isDisabled={index === order.length - 1 || save.isPending}
                    onPress={() => move(id, 1)}
                  >
                    <ArrowDown />
                  </ActionButton>
                </Flex>
              }
            >
              <Text>{label(id)}</Text>
            </RowListItem>
          ))}
        </RowList>
        {failure !== null && (
          <ModalSendFailure
            error={failure}
            onRetry={submit}
            isRetryDisabled={!isOnline || !isMoved}
            onClose={onClose}
          />
        )}
      </Stack>
    </Dialog>
  );
}
