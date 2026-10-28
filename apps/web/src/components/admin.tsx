import { type ListTabs, ToastQueue } from "@moonx/ui-web";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type AdminUsersTab,
  adminTemplatesHref,
  adminUsersHref,
} from "../lib/links";

/** How long the toasts of 26–28 stay (Spectrum's minimum). */
export const ADMIN_TOAST_MS = 5000;

/** Shows the toast of a finished action of 26–28. */
export const adminToast = (text: string) =>
  ToastQueue.neutral(text, { timeout: ADMIN_TOAST_MS });

/** A tab of the operator's screens: 26, or one of 28's lists. */
export type AdminTab = "templates" | AdminUsersTab;

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** The entry was opened from a tab of 26 and 28: its tab takes the keyboard. */
    fromAdminTab?: boolean;
    /** 28's row shown beside its list, or over it in one pane (no URL holds it, SDD 4章). */
    adminRow?: string;
    /** A detail was opened over the list in one pane: leaving it goes back. */
    openedDetail?: boolean;
  }
}

/**
 * The tabs over the list of 26 and 28 (design-spec 6.17「26 と 28 は管理の画面のタブで行き
 * 来する」, 4.5 Tabs): Templates opens 26; Users, Workspaces and Invitations are 28's own
 * three. One row holds both, so the operator's screens never show two rows of tabs. A
 * tab of 28 replaces the entry of the one before, as a filter does; 26 and 28 are two
 * screens, and Back leads from one to the other. Each tab opens a screen, so the arrow
 * keys only move among them, and the tab keeps the keyboard on the screen it opens.
 */
export function useAdminTabs(current: AdminTab): ListTabs {
  const { t } = useTranslation(["admin"]);
  const navigate = useNavigate();
  const fromTab = useRouterState({
    select: (state) => state.location.state.fromAdminTab === true,
  });
  // The tab pressed shows as chosen until the route follows: shown the one before for a
  // moment, the tabs would move the keyboard back to it.
  const [pressed, setPressed] = useState<AdminTab | null>(null);
  if (pressed !== null && pressed === current) setPressed(null);
  const tabs: AdminTab[] = ["templates", "users", "workspaces", "invitations"];
  return {
    "aria-label": t("admin:tabs.label"),
    items: tabs.map((id) => ({ id, label: t(`admin:tabs.${id}`) })),
    selectedKey: pressed ?? current,
    keyboardActivation: "manual",
    autoFocus: fromTab,
    onSelectionChange: (key) => {
      if (key === current) return;
      const state = { fromAdminTab: true };
      if (key === "templates") {
        setPressed(key);
        void navigate({ href: adminTemplatesHref(), state });
      } else if (
        key === "users" ||
        key === "workspaces" ||
        key === "invitations"
      ) {
        setPressed(key);
        void navigate({
          href: adminUsersHref(key),
          replace: current !== "templates",
          state,
        });
      }
    },
  };
}

/**
 * Opening and closing a detail of 26–28 (design-spec 4.1 D, as 14–16 do): beside the
 * list a choice replaces the entry; over the list in one pane it adds one, so Back (a
 * phone's back gesture) returns to the list, and ← goes back over it. A detail opened
 * from its URL has no entry to go back over, and is replaced by the list instead.
 */
export function useDetailHistory() {
  const navigate = useNavigate();
  const router = useRouter();
  const openedHere = useRouterState({
    select: (state) => state.location.state.openedDetail === true,
  });
  return {
    /** Shows `search` (and 28's `row`): beside the list, or over it in one pane. */
    open: (
      next: { search?: Record<string, unknown>; row?: string },
      isTwoColumns: boolean,
    ) =>
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) =>
          next.search === undefined ? previous : next.search,
        replace: isTwoColumns,
        state: (previous) => ({
          ...previous,
          fromAdminTab: false,
          adminRow: next.row,
          ...(isTwoColumns ? {} : { openedDetail: true }),
        }),
      }),
    /** Back to the list: over the entry the detail added, or in place of it. */
    close: (next: { search?: Record<string, unknown> }) => {
      if (openedHere) {
        router.history.back();
        return;
      }
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) =>
          next.search === undefined ? previous : next.search,
        replace: true,
        state: (previous) => ({
          ...previous,
          fromAdminTab: false,
          adminRow: undefined,
        }),
      });
    },
  };
}
