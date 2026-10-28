import {
  ActionButton,
  Button,
  ButtonGroup,
  Dialog,
  Flex,
  Heading,
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

/**
 * A refusal of ids that are no longer the list's every row: V17's at `ids` (SDD 5.7),
 * AD5's at `sections` (5.13).
 */
const refusesIds = (error: unknown, listPath: string) =>
  error instanceof ApiError &&
  error.code === "VALIDATION_FAILED" &&
  Array.isArray(error.detail.details) &&
  (error.detail.details as { path?: unknown }[]).some(
    ({ path }) => path === listPath,
  );

/**
 * "Reorder" of a row's ⋯ (design-spec 6.10: 15's cards, 16's assumptions and risks, 27's
 * sections): the rows as they stood when it opened, each moved up or down by its
 * buttons, then Save order sends the new order at once (SDD 5.7 V17, 5.13 AD5). Large; a
 * full sheet on a phone (3.8). Save order waits for a change, so an order left as it was
 * is not saved (it would turn 16's risks to an order by hand). If someone added or
 * deleted a row meanwhile, the API refuses the ids: the list is read again and the order
 * starts from it. Other failures keep the order, as a modal's do.
 */
export function ReorderDialog({
  title,
  items,
  send,
  reload,
  onClose,
  listPath = "ids",
}: {
  title: string;
  /** The rows in their order when the dialog opens. */
  items: readonly ReorderItem[];
  /** Sends the ids of every row in the new order (V17, AD5). */
  send: (ids: string[]) => Promise<void>;
  /** Reads the list again, after the API found it changed: its rows in their order. */
  reload: () => Promise<readonly ReorderItem[]>;
  onClose: () => void;
  /** Where the API's refusal of a changed list points (27's AD5: `sections`). */
  listPath?: string;
}) {
  const isListChanged = (error: unknown) => refusesIds(error, listPath);
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

/** A heading of 27's question order and the questions under it (AD5). */
export interface ReorderGroup {
  id: string;
  label: string;
  items: readonly ReorderItem[];
}

/** What Save order sends: the headings in their order, each with its items in order. */
export type GroupOrder = { id: string; itemIds: string[] }[];

const orderOf = (groups: readonly ReorderGroup[]): GroupOrder =>
  groups.map((group) => ({
    id: group.id,
    itemIds: group.items.map(({ id }) => id),
  }));

/**
 * 6.10's Reorder for items under headings (27's questions under their sections,
 * design-spec 6.17): the same Dialog and moves, and an item moved up from the top of its
 * heading goes to the end of the one before, moved down from the bottom to the start of
 * the one after (AD5 lets a question change sections). Save order sends every heading's
 * items at once; a list changed meanwhile is read again, as 6.10 does.
 */
export function ReorderGroupedDialog({
  title,
  groups,
  emptyText,
  send,
  reload,
  onClose,
  listPath,
}: {
  title: string;
  /** The headings and their items in their order when the dialog opens. */
  groups: readonly ReorderGroup[];
  /** Under a heading with no item. */
  emptyText: string;
  send: (order: GroupOrder) => Promise<void>;
  reload: () => Promise<readonly ReorderGroup[]>;
  onClose: () => void;
  /** Where the API's refusal of a changed list points. */
  listPath: string;
}) {
  const { t } = useTranslation(["validation"]);
  const isOnline = useIsOnline();
  const prefix = useId();
  const [shown, setShown] = useState(groups);
  const [order, setOrder] = useState(() => orderOf(groups));
  const [wasReloaded, setReloaded] = useState(false);
  const [reloadFailure, setReloadFailure] = useState<unknown>(null);
  const isListChanged = (error: unknown) => refusesIds(error, listPath);
  const save = useMutation({
    mutationFn: send,
    onSuccess: onClose,
    onError: (error) => {
      if (!isListChanged(error)) return;
      reload().then((fresh) => {
        setShown(fresh);
        setOrder(orderOf(fresh));
        setReloaded(true);
        save.reset();
      }, setReloadFailure);
    },
  });
  const failure =
    reloadFailure ??
    (save.error !== null && !isListChanged(save.error) ? save.error : null);
  const original = orderOf(shown);
  const isMoved = order.some(
    (group, index) =>
      group.itemIds.join(" ") !== original[index]?.itemIds.join(" "),
  );
  const labels = new Map(
    shown.flatMap((group) => group.items.map((item) => [item.id, item.label])),
  );
  const label = (id: string) => labels.get(id) ?? "";
  const buttonId = (id: string, step: -1 | 1) =>
    `${prefix}-${id}-${step === -1 ? "up" : "down"}`;
  // An item goes up from the top of the first heading, or down from the bottom of the
  // last, nowhere: elsewhere it moves within its heading or to the next, empty or not.
  const isFirst = (id: string) => order[0]?.itemIds[0] === id;
  const isLast = (id: string) => order.at(-1)?.itemIds.at(-1) === id;
  const move = (id: string, step: -1 | 1) => {
    const g = order.findIndex((group) => group.itemIds.includes(id));
    const group = order[g];
    if (group === undefined) return;
    const i = group.itemIds.indexOf(id);
    const next = order.map((entry) => ({
      ...entry,
      itemIds: [...entry.itemIds],
    }));
    const target = next[g] as GroupOrder[number];
    const to = i + step;
    if (to >= 0 && to < target.itemIds.length) {
      target.itemIds[i] = target.itemIds[to] as string;
      target.itemIds[to] = id;
    } else {
      const neighbour = next[g + step];
      if (neighbour === undefined) return;
      target.itemIds.splice(i, 1);
      if (step === -1) neighbour.itemIds.push(id);
      else neighbour.itemIds.unshift(id);
    }
    setOrder(next);
    save.reset();
    setReloadFailure(null);
    // Focus follows the item; at either end, its other button takes it.
    const atEnd =
      (step === -1 && next[0]?.itemIds[0] === id) ||
      (step === 1 && next.at(-1)?.itemIds.at(-1) === id);
    requestAnimationFrame(() =>
      document
        .getElementById(buttonId(id, atEnd ? (-step as -1 | 1) : step))
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
        {order.map((group) => {
          const heading = shown.find((entry) => entry.id === group.id)?.label;
          const headingId = `${prefix}-${group.id}`;
          return (
            <Stack key={group.id} gap="space-100">
              <Heading level={3} variant="label" id={headingId}>
                {heading}
              </Heading>
              {group.itemIds.length === 0 ? (
                <Text tone="tertiary">{emptyText}</Text>
              ) : (
                <RowList ordered aria-labelledby={headingId}>
                  {group.itemIds.map((id) => (
                    <RowListItem
                      key={id}
                      end={
                        <Flex gap="space-50">
                          <ActionButton
                            id={buttonId(id, -1)}
                            isQuiet
                            size="S"
                            aria-label={t("validation:reorder.up", {
                              item: label(id),
                            })}
                            isDisabled={isFirst(id) || save.isPending}
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
                            isDisabled={isLast(id) || save.isPending}
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
              )}
            </Stack>
          );
        })}
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
