import {
  formatCheckName,
  formatList,
  formatMoney,
  formatMonths,
  formatUnits,
  i18n,
} from "@moonx/i18n";
import type {
  CheckResult,
  CheckState,
  DecisionValue,
  IdeaKeyMetrics,
  IdeaSummary,
  MetricValue,
} from "@moonx/schemas";
import {
  Badge,
  type CheckDotState,
  MetricGroup,
  MetricTile,
  MoonGlyph,
  RowList,
  RowListItem,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { hrefOf } from "../lib/links";

/** The MoonGlyph of a check's state (design-spec 4.4「状態の形」). */
export const dotState = {
  not_started: "not-started",
  partial: "partial",
  done: "done",
} as const satisfies Record<CheckState, CheckDotState>;

/** Names the six checks list as missing past this many show as a count (design-spec 6.9). */
const MISSING_NAMES_MAX = 2;

/**
 * The checks not done of an idea's row (design-spec 6.8・6.9): their names, or past two
 * their count ("Missing: 6 checks"); null when all are done.
 */
export function missingChecks(checks: IdeaSummary["checks"]): string | null {
  const missing = checks.filter(({ state }) => state !== "done");
  if (missing.length === 0) return null;
  if (missing.length > MISSING_NAMES_MAX) {
    return i18n.t("dashboard:ideas.missingCount", { count: missing.length });
  }
  return i18n.t("dashboard:ideas.missing", {
    names: formatList(
      missing.map(({ key, params }) => formatCheckName(key, params)),
    ),
  });
}

/** The CheckDots of an idea's six checks, named as 6.1 names them. */
export const checkDots = (checks: IdeaSummary["checks"]) =>
  checks.map(({ key, state, params }) => ({
    name: formatCheckName(key, params),
    state: dotState[state],
  }));

/** The latest decision as a Badge: Undecided in a dashed frame (design-spec 4.5). */
export function DecisionBadge({
  decision,
}: {
  decision: DecisionValue | null;
}) {
  const { t } = useTranslation(["common"]);
  return decision === null ? (
    <Badge fillStyle="dashed">{t("common:decision.undecided")}</Badge>
  ) : (
    <Badge>{t(`common:decision.${decision}`)}</Badge>
  );
}

const reasonKey = "validation:home.checks.reason";

/**
 * Why a check is not done yet (design-spec 6.1: the checks' "不足の理由", also the first
 * Next step's reason), or null for a done one.
 */
export function checkReason(check: CheckResult): string | null {
  if (check.state === "done") return null;
  const t = i18n.t.bind(i18n);
  const missing = check.detail?.missing ?? [];
  switch (check.key) {
    case "competitors":
      return (check.count ?? 0) === 0
        ? t(`${reasonKey}.competitorsNone`)
        : t(`${reasonKey}.competitorsSome`, {
            count: check.count ?? 0,
            min: check.params.min ?? 0,
          });
    case "local_price":
      return t(`${reasonKey}.localPrice`, {
        priced: t(`${reasonKey}.localPricePriced`, {
          count: check.params.pricedCompetitors ?? 0,
        }),
        logs: t(`${reasonKey}.localPriceLogs`, {
          count: check.params.researchLogs ?? 0,
        }),
      });
    case "costs": {
      const parts: string[] = [];
      const emptyRows = check.detail?.emptyRows ?? 0;
      if (emptyRows > 0) {
        parts.push(t(`${reasonKey}.costsEmpty`, { count: emptyRows }));
      }
      if (
        missing.includes("initial_amount") &&
        missing.includes("monthly_amount")
      ) {
        parts.push(t(`${reasonKey}.costsNone`));
      } else if (missing.includes("initial_amount")) {
        parts.push(t(`${reasonKey}.costsNoInitial`));
      } else if (missing.includes("monthly_amount")) {
        parts.push(t(`${reasonKey}.costsNoMonthly`));
      }
      return parts.join(t("app:separator"));
    }
    case "break_even":
      if (missing.includes("price") && missing.includes("monthly_costs")) {
        return t(`${reasonKey}.breakEvenNeedsBoth`);
      }
      if (missing.includes("price"))
        return t("common:metricReason.needs_price");
      if (missing.includes("monthly_costs")) {
        return t("common:metricReason.needs_monthly_costs");
      }
      // Price and monthly costs are there: the margin is what stops it (6.1 check 4).
      return t(`${reasonKey}.breakEvenMargin`);
    case "permits":
      // Its link opens the Permits cost row while the template's row is there (6.1).
      return check.link?.screen === 17
        ? t(`${reasonKey}.permitsRow`)
        : t(`${reasonKey}.permitsLog`);
    case "demand_signal":
      return (check.count ?? 0) === 0
        ? t(`${reasonKey}.demandNone`)
        : t(`${reasonKey}.demandSome`, {
            count: check.count ?? 0,
            min: check.params.researchLogs ?? 0,
          });
  }
}

/**
 * The six checks of an idea (design-spec 6.1, d1-moon.html .rows): each state's moon,
 * its name, its state with the count where it has one ("Done (4)"), and on 13 why it is
 * not done. The rows open the screens that fill them as those are built.
 */
export function CheckRows({
  checks,
  hasReasons = true,
  "aria-label": label,
}: {
  checks: readonly CheckResult[];
  /** 13 says why each is not done; 6's detail lists the states only (s06-ideas.html). */
  hasReasons?: boolean;
  "aria-label": string;
}) {
  const { t } = useTranslation(["common", "validation"]);
  return (
    <RowList aria-label={label}>
      {checks.map((check) => {
        const state = t(`common:checkState.${check.state}`);
        return (
          <RowListItem
            key={check.key}
            href={check.link === null ? undefined : hrefOf(check.link)}
            start={<MoonGlyph state={dotState[check.state]} />}
            end={
              check.count !== null && check.count > 0
                ? t("validation:home.checks.endCount", {
                    state,
                    count: check.count,
                  })
                : state
            }
            description={
              hasReasons ? (checkReason(check) ?? undefined) : undefined
            }
          >
            {formatCheckName(check.key, check.params)}
          </RowListItem>
        );
      })}
    </RowList>
  );
}

const metricOrder = [
  "initial_cost_total",
  "break_even_units_day",
  "expected_operating_profit",
  "payback_months",
] as const satisfies readonly (keyof IdeaKeyMetrics)[];

const units = {
  initial_cost_total: undefined,
  break_even_units_day: "validation:home.unit.perDay",
  expected_operating_profit: "validation:home.unit.perMonth",
  payback_months: "validation:home.unit.months",
} as const;

/** A key number's value in its format with its bound (design-spec 6.4). */
function metricValue(
  key: (typeof metricOrder)[number],
  { value, bound }: MetricValue & { value: number },
  currency: string,
): string {
  switch (key) {
    case "initial_cost_total":
    case "expected_operating_profit":
      return formatMoney(value, currency, { bound });
    case "break_even_units_day":
      return formatUnits(value, { bound });
    case "payback_months":
      return formatMonths(value, { bound, withUnit: false });
  }
}

/**
 * The four key numbers of an idea (design-spec 6.1・6.8): startup costs, break-even per
 * day, Expected profit per month and payback, each with its unit and, for a bound, the
 * line saying so (d1-moon.html .note). A number that cannot be calculated shows why
 * (6.4「計算できない主要指標の表示」); a contribution margin of zero or less adds its
 * warning under the break-even (6.1「状態」).
 */
export function KeyMetrics({
  metrics,
  currency,
  variant,
  hasMarginWarning = false,
  "aria-label": label,
}: {
  metrics: IdeaKeyMetrics;
  currency: string;
  variant: "band" | "pair";
  /** EconomicsResult warns `margin_not_positive` (V1's `economicsWarnings`). */
  hasMarginWarning?: boolean;
  "aria-label": string;
}) {
  const { t } = useTranslation(["validation", "common"]);
  return (
    <MetricGroup aria-label={label} variant={variant}>
      {metricOrder.map((key) => {
        const metric = metrics[key];
        const label = t(`validation:home.metric.${key}`);
        if (metric.value === null) {
          const warns = hasMarginWarning && key === "break_even_units_day";
          return (
            <MetricTile
              key={key}
              label={label}
              value={t(`common:metricReason.${metric.reason ?? "none"}`)}
              isPlaceholder
              supplement={
                warns ? t("validation:home.marginWarning") : undefined
              }
              supplementTone={warns ? "notice" : undefined}
            />
          );
        }
        const unit = units[key];
        return (
          <MetricTile
            key={key}
            label={label}
            value={metricValue(
              key,
              { ...metric, value: metric.value },
              currency,
            )}
            unit={unit === undefined ? undefined : t(unit)}
            supplement={
              variant === "band" && metric.bound !== "exact"
                ? t(`validation:home.bound.${metric.bound}`)
                : undefined
            }
          />
        );
      })}
    </MetricGroup>
  );
}
