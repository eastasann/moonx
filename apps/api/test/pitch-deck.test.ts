import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { planId, userId } from "@moonx/db/seed";
import { formatDate } from "@moonx/i18n";
import { eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
const who = {} as Record<"ana" | "kenji" | "paolo" | "grace" | "admin", Record<string, string>>;

beforeAll(async () => {
  t = await startTestApp();
  for (const p of ["ana", "kenji", "grace", "admin"] as const) who[p] = await login(t.app, p);
});
afterAll(async () => {
  await t.close();
});

const planA = planId("piaya-a");
const deckPath = (id: string, query: string) => `/api/v1/plans/${id}/pitch-deck?${query}`;
const pdfPath = (id: string, query: string) => `/api/v1/plans/${id}/pitch-deck.pdf?${query}`;

async function fetchPdf(path: string, as: Record<string, string>) {
  const response = await t.app.handle(new Request(`http://localhost${path}`, { headers: as }));
  return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
}

async function readPdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return { pages: pdf.numPages, text: text as string[] };
}

describe("P12 deck", () => {
  test("the one-minute deck has the 8 slides of design-spec 6.14 with the plan's words", async () => {
    const res = await call(t.app, "GET", deckPath(planA, "variant=one"), { as: who.grace });
    expect(res.status).toBe(200);
    expect(res.body.variant).toBe("one");
    expect(res.body.source).toEqual({ kind: "latest" });
    expect(res.body.slides.map((s: { key: string }) => s.key)).toEqual([
      "title",
      "problem",
      "customer",
      "solution",
      "why_now",
      "business_model",
      "why_us",
      "next_step",
    ]);
    expect(res.body.businessName).toBe("Piaya Gift Box Co.");
    expect(res.body.footer).toMatchObject({
      businessName: "Piaya Gift Box Co.",
      versionLabel: "Draft",
    });
    const model = res.body.slides.find((s: { key: string }) => s.key === "business_model");
    expect(model.type).toBe("number");
    expect(model.numbers.map((n: { metricKey: string }) => n.metricKey)).toEqual(
      expect.arrayContaining(["selling_price", "break_even_units_day"]),
    );
    expect(res.body.speakerNotes).toEqual(expect.any(String));
  });

  test("the five-minute deck has 12 slides and economics from the validation", async () => {
    const res = await call(t.app, "GET", deckPath(planA, "variant=five"), { as: who.ana });
    expect(res.body.slides).toHaveLength(12);
    const economics = res.body.slides.find((s: { key: string }) => s.key === "economics");
    expect(economics.type).toBe("table");
    expect(economics.table.columns.length).toBeGreaterThan(2);
    const competition = res.body.slides.find((s: { key: string }) => s.key === "competition");
    expect(competition.table.rows.length).toBeGreaterThan(0);
    expect(competition.table.rows.length).toBeLessThanOrEqual(5);
  });

  test("the five-minute deck reads §8's text sub-items, §10, the §11 table and §20's text", async () => {
    const res = await call(t.app, "GET", deckPath(planA, "variant=five"), { as: who.ana });
    const texts = (key: string) =>
      res.body.slides
        .find((s: { key: string }) => s.key === key)
        .bullets.map((b: { text: string }) => b.text) as string[];
    const model = texts("business_model");
    expect(model).toHaveLength(3);
    expect(model[0]).toStartWith("Revenue: Gift box sales");
    expect(model[1]).toStartWith("Secondary revenue: Monthly office subscriptions");
    expect(model[2]).toStartWith("Why the startup cost is justified: The startup cost pays back");
    const whyUs = texts("why_us");
    expect(whyUs).toHaveLength(4);
    expect(whyUs[1]).toStartWith("Missing capabilities: Food production experience");
    expect(whyUs[2]).toStartWith("Filling the gaps: Contract a licensed bakery");
    expect(whyUs[3]).toStartWith("Founders: Ana Villanueva — Lead; Kenji Mori — Operations");
    const economics = texts("economics");
    expect(economics.at(-1)).toStartWith("Funding trigger: If cash falls below");
  });

  test("a saved version is the source of text, numbers and the footer", async () => {
    const versions = (await call(t.app, "GET", `/api/v1/plans/${planA}/versions`, { as: who.ana }))
      .body.items;
    const res = await call(
      t.app,
      "GET",
      deckPath(planA, `variant=five&versionId=${versions[0].id}`),
      { as: who.ana },
    );
    expect(res.body.source).toMatchObject({
      kind: "version",
      versionId: versions[0].id,
      name: "v1 For advisors",
    });
    expect(res.body.footer.versionLabel).toBe("v1 For advisors");
    expect(res.body.footer.date).toBe(versions[0].savedAt.slice(0, 10));
  });

  test("empty materials are named, comment counts follow the slide key, bad input is refused", async () => {
    const empty = await call(t.app, "GET", deckPath(planId("piaya-b"), "variant=one"), {
      as: who.ana,
    });
    const sparse = empty.body.slides.filter(
      (s: { emptySources: string[] }) => s.emptySources.length > 0,
    );
    expect(sparse.length).toBeGreaterThan(0);

    await t.db.insert(schema.comments).values({
      workspaceId: (await t.db.select().from(schema.ideas).limit(1))[0]?.workspaceId as string,
      targetType: "pitch_slide",
      targetId: planA,
      targetKey: "five.market",
      authorId: userId("kenji"),
      body: "Check the share",
    });
    const five = await call(t.app, "GET", deckPath(planA, "variant=five"), { as: who.ana });
    expect(five.body.slides.find((s: { key: string }) => s.key === "market").commentCount).toBe(1);
    expect(five.body.slides.find((s: { key: string }) => s.key === "problem").commentCount).toBe(0);

    expect((await call(t.app, "GET", deckPath(planA, "variant=ten"), { as: who.ana })).status).toBe(
      422,
    );
    expect(
      (await call(t.app, "GET", `/api/v1/plans/${planA}/pitch-deck`, { as: who.ana })).status,
    ).toBe(422);
    expect(
      (await call(t.app, "GET", deckPath(planA, "variant=one"), { as: who.admin })).status,
    ).toBe(403);
  });
});

describe("P13 PDF", () => {
  test("the one-minute PDF has 8 landscape pages with the deck's words", async () => {
    const { response, bytes } = await fetchPdf(pdfPath(planA, "variant=one"), who.grace);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]+\.pdf"; filename\*=UTF-8''/);
    expect(disposition).toContain("one-draft-");
    const { pages, text } = await readPdf(bytes);
    expect(pages).toBe(8);
    const all = text.join("\n");
    expect(all).toContain("Piaya Gift Box Co.");
    expect(all).toContain("Problem");
    expect(all).toContain("Draft");
    const deck = (await call(t.app, "GET", deckPath(planA, "variant=one"), { as: who.ana })).body;
    const bullet = deck.slides.find((s: { key: string }) => s.key === "problem").bullets[0]
      .text as string;
    expect(all.replace(/\s+/g, " ")).toContain(bullet.replace(/\s+/g, " ").slice(0, 30));
  });

  test("the five-minute PDF has 12 pages and a version name in the footer and the file name", async () => {
    const versions = (await call(t.app, "GET", `/api/v1/plans/${planA}/versions`, { as: who.ana }))
      .body.items;
    const { response, bytes } = await fetchPdf(
      pdfPath(planA, `variant=five&versionId=${versions[0].id}`),
      who.ana,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("five-v1-For-advisors-");
    const { pages, text } = await readPdf(bytes);
    expect(pages).toBe(12);
    expect(text.join("\n")).toContain("v1 For advisors");
    const footerDate = versions[0].savedAt.slice(0, 10) as string;
    expect(text[0]).toContain(formatDate(footerDate));
    expect(text[0]).not.toContain(footerDate);
  });

  test("a Japanese answer is embedded with the fallback font", async () => {
    const answer = await call(t.app, "GET", `/api/v1/plans/${planA}/items/4`, { as: who.ana });
    const primary = answer.body.answers.find(
      (a: { questionKey: string }) => a.questionKey === "P.04.1",
    );
    await call(t.app, "PUT", `/api/v1/plans/${planA}/answers/P.04.1`, {
      as: who.ana,
      body: {
        text: "バコロドの職場では、贈り物の手配に時間がかかる。",
        lockVersion: primary.lockVersion,
      },
    });
    const { response, bytes } = await fetchPdf(pdfPath(planA, "variant=one"), who.ana);
    expect(response.status).toBe(200);
    const { text } = await readPdf(bytes);
    expect(text.join("\n")).toContain("バコロドの職場");
    expect(bytes.length).toBeLessThan(2_000_000);
  });

  test("the PDF is limited per user and refuses people without access", async () => {
    expect((await fetchPdf(pdfPath(planA, "variant=one"), who.admin)).response.status).toBe(403);
    await t.db
      .insert(schema.rateLimits)
      .values({ key: `app:pdf:${userId("kenji")}`, count: 30, lastRequest: Date.now() })
      .onConflictDoNothing();
    const limited = await fetchPdf(pdfPath(planA, "variant=one"), who.kenji);
    expect(limited.response.status).toBe(429);
    await t.db
      .delete(schema.rateLimits)
      .where(eq(schema.rateLimits.key, `app:pdf:${userId("kenji")}`));
  });
});
