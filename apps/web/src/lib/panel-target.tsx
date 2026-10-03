import { COMMENT_TARGET_TYPES, type TargetType, targetTypeSchema } from "@moonx/schemas";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

/** The screens whose whole history H1 can list (`containerType`). */
export const CONTAINER_TYPES = ["self_analysis", "validation", "business_plan", "idea"] as const;
export type ContainerType = (typeof CONTAINER_TYPES)[number];

/** What a `?target=` value names, once read. */
export type PanelTarget =
  | { kind: "item"; type: TargetType; id: string; key: string | null }
  | { kind: "container"; containerType: ContainerType; id: string; sectionKey: string | null };

const CONTAINER_PREFIX = "container";

/** `<targetType>:<targetId>[:<targetKey>]` for one item (SDD 4). */
export function formatItemTarget(type: TargetType, id: string, key?: string | null): string {
  return key ? `${type}:${id}:${key}` : `${type}:${id}`;
}

/** `container:<containerType>:<containerId>[:<sectionKey>]` for a whole screen (SDD 4). */
export function formatContainerTarget(
  containerType: ContainerType,
  id: string,
  sectionKey?: string | null,
): string {
  const base = `${CONTAINER_PREFIX}:${containerType}:${id}`;
  return sectionKey ? `${base}:${sectionKey}` : base;
}

/**
 * Reads a `?target=` value. Keys may hold `:`, so only the leading parts are split off. A value
 * that names no known target type returns null (a typed or old link), never throws.
 */
export function parsePanelTarget(raw: string | null | undefined): PanelTarget | null {
  if (!raw) return null;
  const [head, second, third, ...rest] = raw.split(":");
  if (head === CONTAINER_PREFIX) {
    if (!(CONTAINER_TYPES as readonly string[]).includes(second ?? "") || !third) return null;
    return {
      kind: "container",
      containerType: second as ContainerType,
      id: third,
      sectionKey: rest.length > 0 ? rest.join(":") : null,
    };
  }
  if (!head || !second || !TARGET_TYPES.has(head)) return null;
  const key = [third, ...rest].filter((part) => part !== undefined).join(":");
  return { kind: "item", type: head as TargetType, id: second, key: key || null };
}

const TARGET_TYPES: ReadonlySet<string> = new Set(targetTypeSchema.options);

const COMMENTABLE: ReadonlySet<string> = new Set(COMMENT_TARGET_TYPES);

/**
 * The comment target behind a panel target, as a `<targetType>:<targetId>[:<targetKey>]` string,
 * or null when nothing can be commented on there. A comment sits on one item, so a screen's
 * history target has comments only when the screen is an idea.
 */
export function commentTargetOf(target: PanelTarget | null): string | null {
  if (!target) return null;
  if (target.kind === "item") {
    return COMMENTABLE.has(target.type)
      ? formatItemTarget(target.type, target.id, target.key)
      : null;
  }
  return target.containerType === "idea" ? formatItemTarget("idea", target.id) : null;
}

/** What the header's panel entries open. */
export interface HeaderPanelTarget {
  /** The target the History button opens, or null when the screen has no history to show. */
  target: string | null;
  /** The target the Comments button opens, or null when nothing there takes comments. */
  commentTarget: string | null;
  /** The idea or plan is archived, so the Comments panel is read-only (design-spec 1.3, 6.8). */
  archived?: boolean;
}

interface PanelTargetValue extends HeaderPanelTarget {
  setTargets: (targets: HeaderPanelTarget) => void;
}

const NO_TARGETS: HeaderPanelTarget = { target: null, commentTarget: null };

const PanelTargetContext = createContext<PanelTargetValue | null>(null);

export function PanelTargetProvider({ children }: { children: ReactNode }) {
  const [targets, setTargets] = useState<HeaderPanelTarget>(NO_TARGETS);
  const value = useMemo(() => ({ ...targets, setTargets }), [targets]);
  return <PanelTargetContext.Provider value={value}>{children}</PanelTargetContext.Provider>;
}

/**
 * A screen with something to comment on or show the history of calls this with the item, or with
 * the screen's `container:` target (see {@link formatContainerTarget}); the header then offers the
 * Comments and History entries for it. It clears when the screen goes.
 *
 * `options.comments` names the comment target of a screen whose own target takes none (the
 * default is the item itself, or the idea of an idea screen). `options.history: false` leaves out
 * the History button, for a screen whose viewer may not read the history (a shared self analysis).
 * `options.archived` tells the Comments panel the idea or plan is archived, so it shows no input
 * instead of waiting for the API to refuse the first post.
 */
export function usePanelTarget(
  target: string | null,
  options?: { comments?: string | null; history?: boolean; archived?: boolean },
): void {
  const setTargets = useContext(PanelTargetContext)?.setTargets;
  const comments = options?.comments;
  const history = options?.history ?? true;
  const archived = options?.archived ?? false;
  useEffect(() => {
    setTargets?.({
      target: history ? target : null,
      commentTarget: comments !== undefined ? comments : commentTargetOf(parsePanelTarget(target)),
      archived,
    });
    return () => setTargets?.(NO_TARGETS);
  }, [setTargets, target, comments, history, archived]);
}

/** The items the header's panel entries open. */
export function useHeaderPanelTarget(): HeaderPanelTarget {
  const context = useContext(PanelTargetContext);
  return context ?? NO_TARGETS;
}
