import type { Classification } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import type { ImportContext } from "../src/lib/ai-exchange";
import { renderApp, WORKSPACE } from "./support";
import {
  APPLY_URL,
  api,
  importPath,
  paste,
  pressNext,
  registerAiHooks,
  VALIDATION,
  validationContext,
} from "./support-ai";

registerAiHooks();

const PATH = importPath(`target=validation&id=${VALIDATION}`);
const EVIDENCE_URL = `POST /api/v1/validations/${VALIDATION}/evidence`;
const RESEARCH_URL = `GET /api/v1/validations/${VALIDATION}/research-log`;
const LOG = {
  id: "77777777-7777-4777-8777-777777777777",
  observedOn: "2026-09-12",
  topic: "Store observation: SM Bacolod",
};
const FACT: Classification = {
  fau: "fact",
  confidence: null,
  state: "fact",
  evidence: [
    {
      id: "e1",
      kind: "research_log",
      researchLog: { ...LOG, sourceType: "store_observation", deleted: false },
      url: null,
      note: null,
    },
  ],
};

async function toReview(text: string) {
  await paste(text);
  await pressNext();
  await screen.findByRole("list", { name: "Match" });
  await pressNext();
  await screen.findByRole("heading", { name: "Imported (editable)" });
}

test("pasting again clears what was edited on the Review step", async () => {
  api();
  await renderApp(PATH);
  const reply = "## [V.01.WHO]\nBPO HR teams";
  await toReview(reply);
  const field = screen.getByRole("textbox", { name: "WHO" });
  await userEvent.type(field, " and admins");
  expect(field).toHaveValue("BPO HR teams and admins");

  await userEvent.click(screen.getByRole("button", { name: "Back" }));
  await userEvent.click(screen.getByRole("button", { name: "Back" }));
  await toReview(reply);
  expect(screen.getByRole("textbox", { name: "WHO" })).toHaveValue("BPO HR teams");
});

test("Fact opens M2 and the evidence attached there is applied with the import", async () => {
  let context: ImportContext = validationContext();
  const { calls } = api(
    {
      [RESEARCH_URL]: () => ({
        body: {
          items: [
            {
              ...LOG,
              observation: null,
              sourceType: null,
              sourceUrl: null,
              supportsChecks: [],
              supportsNote: null,
              lockVersion: 1,
              updatedAt: null,
              updatedBy: null,
              createdBy: null,
              usedAsEvidenceCount: 0,
              commentCount: 0,
            },
          ],
          nextCursor: null,
        },
      }),
      [EVIDENCE_URL]: () => {
        // The server now holds Fact with the evidence, under a new version.
        context = {
          ...context,
          questions: context.questions.map((q) =>
            q.questionKey === "V.01.WHO"
              ? { ...q, current: { ...q.current, classification: FACT, lockVersion: 3 } }
              : q,
          ),
        };
        return {
          status: 201,
          body: { evidence: { id: "e1" }, classification: FACT, lockVersion: 3 },
        };
      },
      [APPLY_URL]: () => ({
        body: {
          applied: 1,
          needsClassification: 0,
          batchId: "99999999-9999-4999-8999-999999999999",
        },
      }),
    },
    { context: () => context },
  );
  await renderApp(PATH);
  await toReview("## [V.01.WHO]\nBPO HR teams");

  await userEvent.click(screen.getByRole("radio", { name: "Fact" }));
  const sheet = await screen.findByRole("dialog", { name: "Evidence" });
  await userEvent.click(await within(sheet).findByRole("checkbox", { name: /Store observation/ }));
  await userEvent.click(within(sheet).getByRole("button", { name: "Attach 1 entry" }));
  await waitFor(() =>
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      target: { type: "validation_answer", id: VALIDATION, key: "V.01.WHO" },
      researchLogEntryId: LOG.id,
      setFact: true,
      lockVersion: 2,
    }),
  );
  await userEvent.click(within(sheet).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Evidence" })).toBeNull());
  await waitFor(() => expect(screen.getByRole("radio", { name: "Fact" })).toBeChecked());
  expect(screen.queryByText(/Updated by|Updated just now/)).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Apply 1 change" }));
  await waitFor(() => {
    const body = calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/apply"))?.body;
    expect(body).toMatchObject({
      changes: [
        {
          questionKey: "V.01.WHO",
          text: "BPO HR teams",
          baseLockVersion: 3,
          classification: { fau: "fact" },
        },
      ],
    });
  });
});

test("closing M2 without evidence leaves the choice as it was", async () => {
  api();
  await renderApp(PATH);
  await toReview("## [V.01.WHO]\nBPO HR teams");
  await userEvent.click(screen.getByRole("radio", { name: "Fact" }));
  const sheet = await screen.findByRole("dialog", { name: "Evidence" });
  await userEvent.click(within(sheet).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Evidence" })).toBeNull());
  expect(screen.getByRole("radio", { name: "Fact" })).not.toBeChecked();
});

test("an answer that is empty now cannot take evidence yet and says to apply first", async () => {
  api();
  await renderApp(PATH);
  await toReview("## [V.10.WHY_WORK]\nSame-day delivery");
  await userEvent.click(screen.getByRole("radio", { name: "Fact" }));
  expect(
    await screen.findByText(
      "This answer is empty now, so evidence can't be attached yet. Apply first, then attach evidence in the question.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Evidence" })).toBeNull();
});

test("entered from 11 the whole validation is in scope and Back returns to that question screen", async () => {
  api();
  const returnTo = `/w/${WORKSPACE}/ideas/x/questions/01`;
  await renderApp(
    importPath(`target=validation&id=${VALIDATION}&returnTo=${encodeURIComponent(returnTo)}`),
  );
  await paste("## [V.10.WHY_WORK]\nSame-day delivery");
  await pressNext();
  const rows = within(await screen.findByRole("list", { name: "Match" })).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("Matched");
  const back = screen.getAllByRole("link", { name: /Back/ }).find((l) => l.closest("main"));
  expect(back).toHaveAttribute("href", returnTo);
});
