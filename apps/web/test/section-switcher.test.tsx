import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { IDEA_ID } from "./question-fixtures";
import { renderApp, WORKSPACE } from "./support";
import { COSTS_PATH, costsApi, ECONOMICS_PATH } from "./support-costs";
import { PATH as QUESTIONS_PATH, api as questionsApi } from "./support-questions";
import {
  ASSUMPTIONS_PATH,
  COMPETITORS_PATH,
  RESEARCH_PATH,
  registerResearchHooks,
  researchApi,
} from "./support-research";

registerResearchHooks();

const BASE = `/w/${WORKSPACE}/ideas/${IDEA_ID}`;

/** design-spec 5 "検証の中の移動": the section menu of every screen from 11 to 18. */
const EXPECTED = [
  ["01 Customer & Problem", `${BASE}/questions/01`],
  ["02 Market", `${BASE}/questions/02`],
  ["03 Research Log", `${BASE}/research`],
  ["04 Competitors", `${BASE}/competitors`],
  ["05 Costs", `${BASE}/costs`],
  ["06–08 Unit Economics & Scenarios", `${BASE}/economics`],
  ["09 Assumptions & Risks", `${BASE}/assumptions`],
  ["10 Final Assessment", `${BASE}/questions/10`],
] as const;

const SCREENS: [string, string, () => void][] = [
  ["11 questions", QUESTIONS_PATH(), () => questionsApi()],
  ["14 research log", RESEARCH_PATH(), () => researchApi()],
  ["15 competitors", COMPETITORS_PATH(), () => researchApi()],
  ["16 assumptions and risks", ASSUMPTIONS_PATH(), () => researchApi()],
  ["17 costs", COSTS_PATH(), () => costsApi()],
  ["18 economics", ECONOMICS_PATH(), () => costsApi()],
];

test.each(SCREENS)(
  "%s has the section switcher with a link to each of the eight sections",
  async (_name, path, stub) => {
    stub();
    const user = userEvent.setup();
    await renderApp(path);
    await user.click(await screen.findByRole("button", { name: "Switch section" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => [item.textContent, item.getAttribute("href")])).toEqual(
      EXPECTED.map(([label, href]) => [label, href]),
    );
  },
);
