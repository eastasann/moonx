import {
  type HistoryContainerType,
  historyContainerTypeSchema,
  type TargetRef,
  targetTypeSchema,
  uuidSchema,
} from "@moonx/schemas";

/** The panels a screen opens by its search parameter (SDD 4章 `?panel=`). */
export type PanelName = "comments" | "history";

export const isPanelName = (value: unknown): value is PanelName =>
  value === "comments" || value === "history";

/** A screen as a whole (SDD 4章): its comments, or its history, in one list. */
export interface ScreenTarget {
  containerType: HistoryContainerType;
  containerId: string;
  /** The sections the screen shows (SDD 6.3「画面と節の対応」); empty for all of it. */
  sectionKeys: readonly string[];
}

/** What a panel is about: one item's threads or changes, or a whole screen's. */
export type PanelTarget =
  | { kind: "item"; item: TargetRef }
  | { kind: "screen"; screen: ScreenTarget };

const CONTAINER = "container";

/**
 * The `target` of SDD 4章: `<targetType>:<targetId>[:<targetKey>]` for an item (the key
 * may hold `:`), `container:<containerType>:<containerId>[:<sectionKey>,...]` for a
 * screen. Anything else names nothing, and the panel stays closed.
 */
export function parsePanelTarget(value: unknown): PanelTarget | undefined {
  if (typeof value !== "string") return undefined;
  const [head, id, ...rest] = value.split(":");
  if (head === CONTAINER) {
    const [containerId, sections] = [rest[0], rest.slice(1)];
    const type = historyContainerTypeSchema.safeParse(id);
    if (!type.success || !uuidSchema.safeParse(containerId).success) {
      return undefined;
    }
    if (sections.length > 1) return undefined;
    const sectionKeys = sections[0] === undefined ? [] : sections[0].split(",");
    if (sectionKeys.some((key) => key === "")) return undefined;
    return {
      kind: "screen",
      screen: {
        containerType: type.data,
        containerId: containerId as string,
        sectionKeys,
      },
    };
  }
  const type = targetTypeSchema.safeParse(head);
  if (!type.success || !uuidSchema.safeParse(id).success) return undefined;
  const key = rest.length === 0 ? null : rest.join(":");
  if (key === "") return undefined;
  return { kind: "item", item: { type: type.data, id: id as string, key } };
}

/** The `target` search value that names `target` (the inverse of {@link parsePanelTarget}). */
export function formatPanelTarget(target: PanelTarget): string {
  if (target.kind === "item") {
    const { type, id, key } = target.item;
    return key == null ? `${type}:${id}` : `${type}:${id}:${key}`;
  }
  const { containerType, containerId, sectionKeys } = target.screen;
  const base = `${CONTAINER}:${containerType}:${containerId}`;
  return sectionKeys.length === 0 ? base : `${base}:${sectionKeys.join(",")}`;
}

/** Whether `a` and `b` name the same screen. */
export const sameScreen = (a: ScreenTarget, b: ScreenTarget) =>
  a.containerType === b.containerType &&
  a.containerId === b.containerId &&
  a.sectionKeys.join(",") === b.sectionKeys.join(",");
