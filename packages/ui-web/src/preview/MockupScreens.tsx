import type { ReactNode } from "react";
import { RowList, RowListItem } from "../components/RowList";
import { Section } from "./parts";
import { DeckScreen, ImportScreen, LandingScreen } from "./screens/FlowScreens";
import {
  DecisionScreen,
  QuestionFormScreen,
  SettingsScreen,
} from "./screens/FormScreens";
import { DashboardScreen, ValidationHomeScreen } from "./screens/HubScreens";
import {
  CompetitorsScreen,
  CostsScreen,
  IdeasScreen,
} from "./screens/ListScreens";

/**
 * The screens of docs/mockups, rebuilt from the components with the mockups' own words,
 * each across the whole window as the app draws it (Step 22e): open one beside its
 * mockup at the same width and theme to compare them.
 */
export const mockupScreens: Record<
  string,
  { name: string; pattern: string; render: () => ReactNode }
> = {
  "d1-moon": {
    name: "13 Validation home",
    pattern: "A",
    render: () => <ValidationHomeScreen />,
  },
  "s05-dashboard": {
    name: "5 Dashboard",
    pattern: "A",
    render: () => <DashboardScreen />,
  },
  "s19-decision": {
    name: "19 Decision",
    pattern: "B",
    render: () => <DecisionScreen />,
  },
  "s11-form": {
    name: "11 Question form",
    pattern: "C",
    render: () => <QuestionFormScreen />,
  },
  "s06-ideas": { name: "6 Ideas", pattern: "D", render: () => <IdeasScreen /> },
  "s15-competitors": {
    name: "15 Competitors",
    pattern: "E",
    render: () => <CompetitorsScreen />,
  },
  "s17-costs": {
    name: "17 Costs",
    pattern: "F",
    render: () => <CostsScreen />,
  },
  "s25-import": {
    name: "25 Import from AI",
    pattern: "G",
    render: () => <ImportScreen />,
  },
  "s09-settings": {
    name: "9 Workspace settings",
    pattern: "H",
    render: () => <SettingsScreen />,
  },
  "s23-deck": {
    name: "23 Pitch Deck",
    pattern: "I",
    render: () => <DeckScreen />,
  },
  "s01-landing": {
    name: "1 Landing",
    pattern: "J",
    render: () => <LandingScreen />,
  },
};

/** The gallery's list of the mockup screens, each opening across the window. */
export function MockupScreensSection() {
  return (
    <Section title="Mockup screens">
      <RowList aria-label="Mockup screens">
        {Object.entries(mockupScreens).map(([key, screen]) => (
          <RowListItem
            key={key}
            href={`/dev/components?screen=${key}`}
            end={`${screen.pattern} · ${key}.html`}
          >
            {screen.name}
          </RowListItem>
        ))}
      </RowList>
    </Section>
  );
}
