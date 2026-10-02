import { Button, Menu, MenuItem, MenuSection, MenuSeparator } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOverlay } from "../../lib/overlay";
import { ideaPlansQuery, type PlanHome, planPaths } from "../../lib/plans";

/**
 * The plans of the idea, archived ones grouped apart, and "Add plan" (M5) for those who may
 * create one. Until the list arrives it offers the plan that is open.
 */
export function PlanSwitcher({
  plan,
  workspaceId,
  ideaId,
  canAddPlan,
}: {
  plan: PlanHome;
  workspaceId: string;
  ideaId: string;
  canAddPlan: boolean;
}) {
  const { t } = useTranslation("planHome");
  const { openModal } = useOverlay();
  const listed = useQuery(ideaPlansQuery(ideaId)).data?.items;
  const plans = listed ?? [{ id: plan.id, name: plan.name, archived: plan.archived }];
  const active = plans.filter((p) => !p.archived);
  const archived = plans.filter((p) => p.archived);
  const row = (p: { id: string; name: string }) => (
    <MenuItem key={p.id} id={p.id} href={planPaths(workspaceId, ideaId, p.id).home}>
      {p.id === plan.id ? t("home.switcher.current", { name: p.name }) : p.name}
    </MenuItem>
  );
  return (
    <Menu
      trigger={
        <Button variant="secondary" size="S">
          {t("home.switcher.plans")}
          <ChevronDown aria-hidden />
        </Button>
      }
      onAction={(key) => key === "add-plan" && openModal("create-plan")}
    >
      <MenuSection title={t("home.switcher.plans")}>{active.map(row)}</MenuSection>
      {archived.length > 0 ? (
        <MenuSection title={t("home.switcher.archived")}>{archived.map(row)}</MenuSection>
      ) : null}
      {canAddPlan ? <MenuSeparator /> : null}
      {canAddPlan ? <MenuItem id="add-plan">{t("home.switcher.add")}</MenuItem> : null}
    </Menu>
  );
}
