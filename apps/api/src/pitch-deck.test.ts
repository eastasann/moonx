import { afterAll, describe, expect, test } from "bun:test";
import { comments, competitors, economicsInputs, planAnswers } from "@moonx/db";
import { formatDate, formatIsoDate } from "@moonx/i18n";
import {
  errorBodySchema,
  type PitchDeck,
  pitchDeckSchema,
  planHomeSchema,
  planVersionSummarySchema,
} from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";
import { PITCH_PDF_LIMIT } from "./pitch-deck";
import { buildTestApp, connectTestDatabase } from "./test-app";
import { apiRequest, teamWithProceedIdea, testFixtures } from "./test-fixtures";
import { pageText, readPdf, textsBelowBody } from "./test-pdf";

// P12 and P13 (SDD 5.9) on a plan drafted through M5: the slides from the plan now and
// from a saved version, who gets the edit links, comment counts, and the PDF read back
// with pdf.js: its pages, its text, the monospaced figures and the rate limit.

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
// 2026-10-01 11:00 in Manila, the users' time zone.
let clock = Date.UTC(2026, 9, 1, 3, 0);
const { app } = buildTestApp(database, { now: () => clock });

type Team = Awaited<ReturnType<typeof teamWithProceedIdea>>;

const call = (
  method: "GET" | "POST" | "PATCH",
  path: string,
  cookie: string,
  body?: unknown,
) => app.handle(apiRequest(method, path, { cookie, body }));

async function draft(team: Team, name = "Plan A") {
  const response = await call(
    "POST",
    `/api/v1/ideas/${team.idea.id}/plans`,
    team.memberCookie,
    {
      name,
    },
  );
  expect(response.status).toBe(201);
  return planHomeSchema.parse(await response.json());
}

async function setAnswer(planId: string, questionKey: string, text: string) {
  await db
    .insert(planAnswers)
    .values({
      businessPlanId: planId,
      questionKey,
      text,
      lockVersion: 1,
      createdAt: new Date(clock),
      updatedAt: new Date(clock),
    })
    .onConflictDoUpdate({
      target: [planAnswers.businessPlanId, planAnswers.questionKey],
      set: { text, updatedAt: new Date(clock) },
    });
}

async function deck(planId: string, cookie: string, query: string) {
  const response = await call(
    "GET",
    `/api/v1/plans/${planId}/pitch-deck?${query}`,
    cookie,
  );
  expect(response.status).toBe(200);
  return pitchDeckSchema.parse(await response.json());
}

const slideOf = (pitch: PitchDeck, key: string) => {
  const slide = pitch.slides.find((candidate) => candidate.key === key);
  if (slide === undefined) throw new Error(`No slide ${key}`);
  return slide;
};

describe("P12 GET /api/v1/plans/{planId}/pitch-deck", () => {
  test("builds the five-minute deck from the plan now, with the validation's competitors", async () => {
    const team = await newTeam();
    const plan = await draft(team);
    await setAnswer(
      plan.id,
      "P.04.1",
      "HR officers lose a morning sourcing gifts",
    );
    await db.insert(competitors).values([
      {
        validationId: team.validationId,
        name: "Second",
        sortOrder: 1,
        typicalPrice: 380,
      },
      {
        validationId: team.validationId,
        name: "First",
        sortOrder: 0,
        type: "direct",
      },
    ]);
    const pitch = await deck(plan.id, team.memberCookie, "variant=five");

    expect(pitch.variant).toBe("five");
    expect(pitch.source).toEqual({ kind: "latest" });
    expect(pitch.slides).toHaveLength(14);
    expect(pitch.businessName).toBe(plan.businessName);
    expect(pitch.footer).toEqual({
      businessName: plan.businessName,
      versionLabel: "Draft",
      date: "2026-10-01",
    });
    expect(pitch.generatedAt).toBe(new Date(clock).toISOString());
    expect(slideOf(pitch, "problem").bullets[0]).toEqual({
      label: "Primary problem",
      text: "HR officers lose a morning sourcing gifts",
      empty: false,
    });
    expect(slideOf(pitch, "competition").table?.rows).toEqual([
      ["First", "Direct Competitor", null, null],
      ["Second", null, "₱380", null],
    ]);
    // The draft's starting milestones, by deadline (none have one: in their order).
    expect(
      slideOf(pitch, "execution").table?.rows.map((row) => row[0]),
    ).toEqual([
      "Business decision",
      "Legal / company setup",
      "Location / supplier readiness",
      "Product / service readiness",
      "Team readiness",
      "Launch readiness",
    ]);
    // Its starting launch rows have no actions yet.
    expect(slideOf(pitch, "launch").bullets).toEqual([
      { label: "Launch Plan", text: "Not written yet", empty: true },
    ]);
    expect(slideOf(pitch, "launch").editSource).toEqual({ itemNo: 25 });
    // A new idea has no numbers yet (design-spec 6.4).
    expect(
      slideOf(pitch, "business_model").numbers.map((n) => n.value.reason),
    ).toEqual(["empty", "empty", "empty", "empty"]);
    expect(slideOf(pitch, "problem").editSource).toEqual({ itemNo: 4 });
    expect(slideOf(pitch, "economics").editInValidation).toBe("costs");
    for (const slide of pitch.slides) expect(slide.overflow).toBe(false);
  });

  test("a version's deck reads its snapshot, and offers no edit links", async () => {
    const team = await newTeam();
    const plan = await draft(team);
    await setAnswer(plan.id, "P.04.1", "As saved");
    await db
      .insert(competitors)
      .values({ validationId: team.validationId, name: "Kept", sortOrder: 0 });
    clock += 60_000;
    const saved = await call(
      "POST",
      `/api/v1/plans/${plan.id}/versions`,
      team.memberCookie,
      {
        name: "v1 For advisors",
      },
    );
    expect(saved.status).toBe(201);
    const version = planVersionSummarySchema.parse(await saved.json());
    await setAnswer(plan.id, "P.04.1", "Changed since");
    await db.insert(competitors).values({
      validationId: team.validationId,
      name: "Added later",
      sortOrder: -1,
    });
    clock += 24 * 60 * 60 * 1000;

    const pitch = await deck(
      plan.id,
      team.memberCookie,
      `variant=one&versionId=${version.id}`,
    );
    expect(pitch.source).toEqual({
      kind: "version",
      versionId: version.id,
      name: "v1 For advisors",
      savedAt: version.savedAt,
    });
    expect(pitch.slides).toHaveLength(8);
    expect(slideOf(pitch, "problem").bullets[0]?.text).toBe("As saved");
    expect(pitch.footer.versionLabel).toBe("v1 For advisors");
    expect(pitch.footer.date).toBe("2026-10-01");
    expect(slideOf(pitch, "title").bullets[2]).toEqual({
      label: "Version",
      text: "v1 For advisors",
      empty: false,
    });
    for (const slide of pitch.slides) {
      expect(slide.editSource).toBeNull();
      expect(slide.editInValidation).toBeNull();
    }
    const five = await deck(
      plan.id,
      team.memberCookie,
      `variant=five&versionId=${version.id}`,
    );
    expect(
      slideOf(five, "competition").table?.rows.map((row) => row[0]),
    ).toEqual(["Kept"]);

    const latest = await deck(plan.id, team.memberCookie, "variant=five");
    expect(slideOf(latest, "problem").bullets[0]?.text).toBe("Changed since");
    expect(
      slideOf(latest, "competition").table?.rows.map((row) => row[0]),
    ).toEqual(["Added later", "Kept"]);
  });

  test("no edit links for a Viewer or an archived idea; an archived plan keeps Edit in validation", async () => {
    const team = await newTeam();
    const plan = await draft(team);
    const viewer = await deck(plan.id, team.viewerCookie, "variant=one");
    expect(viewer.slides.every((slide) => slide.editSource === null)).toBe(
      true,
    );

    const archived = await call(
      "POST",
      `/api/v1/plans/${plan.id}/archive`,
      team.memberCookie,
    );
    expect(archived.status).toBe(200);
    const member = await deck(plan.id, team.memberCookie, "variant=one");
    expect(member.slides.every((slide) => slide.editSource === null)).toBe(
      true,
    );
    // Its idea's validation is still open to edit, as 20 and 21 link to it (6.14).
    expect(slideOf(member, "business_model").editInValidation).toBe(
      "economics",
    );

    const other = await newTeam();
    const live = await draft(other);
    const archivedIdea = await call(
      "POST",
      `/api/v1/ideas/${other.idea.id}/archive`,
      other.memberCookie,
    );
    expect(archivedIdea.status).toBe(200);
    const ofArchivedIdea = await deck(
      live.id,
      other.memberCookie,
      "variant=five",
    );
    expect(
      ofArchivedIdea.slides.every((slide) => slide.editSource === null),
    ).toBe(true);
    expect(
      ofArchivedIdea.slides.every((slide) => slide.editInValidation === null),
    ).toBe(true);
  });

  test("counts the comments on each slide of the variant", async () => {
    const team = await newTeam();
    const plan = await draft(team);
    const comment = (key: string) => ({
      workspaceId: team.workspace.id,
      containerType: "business_plan" as const,
      containerId: plan.id,
      sectionKey: "pitch",
      targetType: "pitch_slide" as const,
      targetId: plan.id,
      targetKey: key,
      authorId: team.viewer.id,
      body: "Say more about the market",
    });
    await db
      .insert(comments)
      .values([
        comment("five.market"),
        comment("five.market"),
        comment("five.launch"),
        comment("one.problem"),
      ]);
    const five = await deck(plan.id, team.viewerCookie, "variant=five");
    expect(
      five.slides
        .map((slide) => [slide.key, slide.commentCount])
        .filter(([, n]) => n !== 0),
    ).toEqual([
      ["market", 2],
      ["launch", 1],
    ]);
    const one = await deck(plan.id, team.viewerCookie, "variant=one");
    expect(slideOf(one, "problem").commentCount).toBe(1);
  });

  test("422 without a variant or with another, 404 for another plan's version", async () => {
    const team = await newTeam();
    const plan = await draft(team);
    const other = await draft(team, "Plan B");
    clock += 60_000;
    const saved = await call(
      "POST",
      `/api/v1/plans/${other.id}/versions`,
      team.memberCookie,
      {
        name: "v1",
      },
    );
    const version = planVersionSummarySchema.parse(await saved.json());

    for (const query of ["", "variant=ten", "variant=one&versionId=nope"]) {
      const response = await call(
        "GET",
        `/api/v1/plans/${plan.id}/pitch-deck?${query}`,
        team.memberCookie,
      );
      expect(response.status).toBe(422);
      expect(errorBodySchema.parse(await response.json()).error.code).toBe(
        "VALIDATION_FAILED",
      );
    }
    for (const path of ["pitch-deck", "pitch-deck.pdf"]) {
      const response = await call(
        "GET",
        `/api/v1/plans/${plan.id}/${path}?variant=one&versionId=${version.id}`,
        team.memberCookie,
      );
      expect(response.status).toBe(404);
      expect(errorBodySchema.parse(await response.json()).error.code).toBe(
        "NOT_FOUND",
      );
    }
  });
});

describe("P13 GET /api/v1/plans/{planId}/pitch-deck.pdf", () => {
  test("one landscape page per slide with the slides' text, the footer, and no speaker notes", async () => {
    const team = await newTeam();
    const plan = await draft(team);
    await setAnswer(
      plan.id,
      "P.04.1",
      "HR officers lose a morning sourcing gifts",
    );
    await setAnswer(plan.id, "P.30.2", "Say this out loud only");
    // Drafted today in the users' time zone: "Oct 1" or the days after.
    const today = formatDate(new Date(clock), {
      timeZone: "Asia/Manila",
      now: new Date(clock),
    });
    const response = await call(
      "GET",
      `/api/v1/plans/${plan.id}/pitch-deck.pdf?variant=five`,
      team.viewerCookie,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const pages = await readPdf(await response.arrayBuffer());
    expect(pages).toHaveLength(14);
    for (const page of pages) {
      expect([page.width, page.height]).toEqual([960, 540]);
    }
    expect(pageText(pages[1] ?? { texts: [] })).toContain(
      "HR officers lose a morning sourcing gifts",
    );
    expect(pageText(pages[1] ?? { texts: [] })).toContain("Problem");
    expect(pageText(pages[0] ?? { texts: [] })).toContain(plan.businessName);
    for (const page of pages) {
      expect(pageText(page)).toContain(
        `${plan.businessName} · Draft · ${today}`,
      );
      expect(pageText(page)).not.toContain("Say this out loud only");
    }

    const one = await call(
      "GET",
      `/api/v1/plans/${plan.id}/pitch-deck.pdf?variant=one`,
      team.viewerCookie,
    );
    expect((await readPdf(await one.arrayBuffer())).length).toBe(8);
  });

  test("writes figures and table numbers in the monospaced font, every character one advance", async () => {
    const team = await newTeam();
    const plan = await draft(team);
    await db.insert(competitors).values({
      validationId: team.validationId,
      name: "Bongbong's",
      typicalPrice: 1380,
      sortOrder: 0,
    });
    await db.insert(economicsInputs).values([
      {
        validationId: team.validationId,
        fieldKey: "selling_price",
        value: 450,
      },
      {
        validationId: team.validationId,
        fieldKey: "units_expected",
        value: 10,
      },
    ]);
    const response = await call(
      "GET",
      `/api/v1/plans/${plan.id}/pitch-deck.pdf?variant=five`,
      team.memberCookie,
    );
    const pages = await readPdf(await response.arrayBuffer());
    const competition = pages[5]?.texts ?? [];
    const price = competition.find((text) => text.str === "₱1,380");
    expect(price?.font).toContain("IBMPlexMono");
    // IBM Plex Mono advances every glyph 600 units of its 1000.
    expect(
      (price?.width ?? 0) / (price?.size ?? 1) / [..."₱1,380"].length,
    ).toBeCloseTo(0.6, 3);
    const name = competition.find((text) => text.str === "Bongbong's");
    expect(name?.font).toContain("IBMPlexSans-");
    const mono = pages
      .flatMap((page) => page.texts)
      .filter((text) => text.font.includes("IBMPlexMono"));
    // The business model's Price, a figure, and the economics' expected revenue (10 a
    // day for the default 30 days at ₱450), a cell.
    const model = pages[6]?.texts ?? [];
    const figure = model.find((text) => text.str === "₱450");
    expect(figure?.font).toContain("IBMPlexMono-SemiBold");
    expect(figure?.size).toBe(print.fontSize.number.figure);
    expect(
      (pages[7]?.texts ?? []).find((text) => text.str === "₱135,000")?.font,
    ).toContain("IBMPlexMono");
    for (const text of mono) {
      expect({
        str: text.str,
        advance: text.width / text.size / [...text.str].length,
      }).toEqual({
        str: text.str,
        advance: expect.closeTo(0.6, 3),
      });
    }
  });

  test("P12 returns the figures' columns where the PDF sets them (ADR-012)", async () => {
    const team = await newTeam();
    const plan = await draft(team);
    await db.insert(economicsInputs).values([
      {
        validationId: team.validationId,
        fieldKey: "selling_price",
        value: 450,
      },
      {
        validationId: team.validationId,
        fieldKey: "units_expected",
        value: 10,
      },
    ]);
    const slides = (await deck(plan.id, team.memberCookie, "variant=five"))
      .slides;
    const response = await call(
      "GET",
      `/api/v1/plans/${plan.id}/pitch-deck.pdf?variant=five`,
      team.memberCookie,
    );
    const pages = await readPdf(await response.arrayBuffer());
    let checked = 0;
    slides.forEach((slide, index) => {
      if (slide.numbers.length === 0) {
        expect(slide.figureColumns).toBeNull();
        return;
      }
      const columns = slide.figureColumns;
      if (columns === null) throw new Error(`No columns on ${slide.key}`);
      expect(columns.widths).toHaveLength(slide.numbers.length);
      const texts = pages[index]?.texts ?? [];
      let left = print.slide.marginX;
      slide.numbers.forEach((number, column) => {
        // Each label starts its column: where the PDF set the column P12 measured.
        const label = texts.find((text) => text.str === number.label);
        expect({ slide: slide.key, label: number.label, x: label?.x }).toEqual({
          slide: slide.key,
          label: number.label,
          x: expect.closeTo(left, 2),
        });
        left += (columns.widths[column] ?? 0) + print.slide.gap;
        checked += 1;
      });
      expect(left - print.slide.gap).toBeCloseTo(
        print.slide.width - print.slide.marginX,
        2,
      );
    });
    // The business model's four figures and the economics' four.
    expect(checked).toBe(8);
  });

  test("long and Japanese answers stay on their slide: cut, embedded and above the footer", async () => {
    const team = await newTeam();
    const plan = await draft(team);
    for (const key of ["P.04.1", "P.04.2", "P.04.3", "P.04.4", "P.04.5"]) {
      await setAnswer(
        plan.id,
        key,
        "Offices buy gifts every month and nobody delivers them. ".repeat(12),
      );
    }
    await setAnswer(
      plan.id,
      "P.03.1",
      "ピアヤの詰め合わせを事務所に届ける。".repeat(40),
    );
    const pitch = await deck(plan.id, team.memberCookie, "variant=five");
    expect(slideOf(pitch, "problem").overflow).toBe(true);
    expect(slideOf(pitch, "problem").bullets).toHaveLength(5);
    expect(slideOf(pitch, "customer").bullets[0]?.text.endsWith("…")).toBe(
      true,
    );

    const response = await call(
      "GET",
      `/api/v1/plans/${plan.id}/pitch-deck.pdf?variant=five`,
      team.memberCookie,
    );
    const pages = await readPdf(await response.arrayBuffer());
    expect(pages).toHaveLength(14);
    expect(pageText(pages[2] ?? { texts: [] })).toContain("ピアヤ");
    expect(textsBelowBody(pages)).toEqual([]);
  });

  test("breaks a word wider than its column inside the column", async () => {
    const team = await newTeam();
    const plan = await draft(team);
    const url = "https://www.facebook.com/PiayaGiftBoxCoIloiloCityOfficeGifts";
    await db
      .insert(competitors)
      .values({ validationId: team.validationId, name: url, sortOrder: 0 });
    const response = await call(
      "GET",
      `/api/v1/plans/${plan.id}/pitch-deck.pdf?variant=five`,
      team.memberCookie,
    );
    const pages = await readPdf(await response.arrayBuffer());
    const pieces = (pages[5]?.texts ?? []).filter((text) =>
      url.includes(text.str),
    );
    expect(pieces.map((piece) => piece.str).join("")).toBe(url);
    // The Name column is the first quarter of the content, less its padding.
    const end =
      print.slide.marginX +
      0.25 * (print.slide.width - 2 * print.slide.marginX) -
      print.slide.cellPaddingX;
    for (const piece of pieces) {
      expect(piece.x + piece.width).toBeLessThanOrEqual(end + 0.5);
    }
  });

  test("names the file by Business Name, variant, version or draft, and date", async () => {
    const team = await newTeam();
    const plan = await draft(team);
    const disposition = async (query: string) =>
      (
        await call(
          "GET",
          `/api/v1/plans/${plan.id}/pitch-deck.pdf?${query}`,
          team.memberCookie,
        )
      ).headers.get("content-disposition");
    const rename = async (businessName: string) => {
      const response = await call(
        "PATCH",
        `/api/v1/plans/${plan.id}`,
        team.memberCookie,
        {
          businessName,
          lockVersion: 0,
          force: true,
        },
      );
      expect(response.status).toBe(200);
    };
    // The day of the plan's last change, in the users' time zone.
    const day = formatIsoDate(new Date(clock), { timeZone: "Asia/Manila" });
    const expected = (ascii: string, file: string) =>
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(
        file,
      ).replace(
        /['()]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      )}`;

    await rename('Piaya\'s / Box: "Co"');
    expect(await disposition("variant=one")).toBe(
      expected(
        `Piaya's - Box- -Co--one-draft-${day}.pdf`,
        `Piaya's - Box- -Co--one-draft-${day}.pdf`,
      ),
    );

    // Full-width signs turn into ASCII ones in the fallback, and are replaced there too.
    await rename("A＂; filename=＂x＼／");
    expect(await disposition("variant=one")).toBe(
      expected(
        `A-; filename=-x---one-draft-${day}.pdf`,
        `A＂; filename=＂x＼／-one-draft-${day}.pdf`,
      ),
    );

    await rename("ピアヤ");
    clock += 60_000;
    const saved = await call(
      "POST",
      `/api/v1/plans/${plan.id}/versions`,
      team.memberCookie,
      {
        name: "v1",
      },
    );
    const version = planVersionSummarySchema.parse(await saved.json());
    expect(await disposition(`variant=five&versionId=${version.id}`)).toBe(
      expected(`___-five-v1-${day}.pdf`, `ピアヤ-five-v1-${day}.pdf`),
    );

    await rename("  ");
    expect(await disposition("variant=one")).toBe(
      expected(`Plan A-one-draft-${day}.pdf`, `Plan A-one-draft-${day}.pdf`),
    );
  });

  test(`allows ${PITCH_PDF_LIMIT.max} PDFs a user an hour (429 RATE_LIMITED), and P12 freely`, async () => {
    const team = await newTeam();
    const plan = await draft(team);
    const pdf = () =>
      call(
        "GET",
        `/api/v1/plans/${plan.id}/pitch-deck.pdf?variant=one`,
        team.viewerCookie,
      );
    for (let made = 0; made < PITCH_PDF_LIMIT.max; made += 1) {
      clock += 1000;
      expect((await pdf()).status).toBe(200);
    }
    const refused = await pdf();
    expect(refused.status).toBe(429);
    const error = errorBodySchema.parse(await refused.json()).error;
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryAfterSeconds).toBe(3600);
    expect(
      (
        await call(
          "GET",
          `/api/v1/plans/${plan.id}/pitch-deck?variant=one`,
          team.viewerCookie,
        )
      ).status,
    ).toBe(200);
    // Another user of the workspace has a count of their own.
    expect(
      (
        await call(
          "GET",
          `/api/v1/plans/${plan.id}/pitch-deck.pdf?variant=one`,
          team.memberCookie,
        )
      ).status,
    ).toBe(200);
    clock += PITCH_PDF_LIMIT.windowMs;
    expect((await pdf()).status).toBe(200);
  }, 60_000);
});

const newTeam = () => teamWithProceedIdea(app, fixtures);
