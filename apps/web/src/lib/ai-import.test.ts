import { matchBlocks, parseAiReply } from "@moonx/domain";
import { describe, expect, test } from "vitest";
import { selfAnalysisContext, validationContext } from "../test/ai";
import {
  changeOf,
  draftOf,
  initialChoice,
  isValid,
  review,
  rowsOf,
} from "./ai-import";

// 25 ② and ③ (design-spec 6.7): where each block goes, and what each question is
// written with.

const context = validationContext();
const all = { kind: "all" } as const;
const target = {
  sections: context.sections,
  questions: context.questions,
  currency: "PHP",
};
const question = (key: string) => {
  const found = context.questions.find((item) => item.questionKey === key);
  if (found === undefined) throw new Error(key);
  return found;
};

const matched = (
  text: string,
  scope = all as Parameters<typeof matchBlocks>[2],
) => matchBlocks(parseAiReply(text), target, scope);

describe("rowsOf (② Match)", () => {
  test("each block's state and why it has no question", () => {
    const blocks = matched(
      [
        "Loose words first.",
        "## [V.01.WHO]",
        "Office workers.",
        "## [V.99.NOPE]",
        "Nothing.",
        "## [V.02.RED_1]",
        "Hidden.",
      ].join("\n"),
    );
    const rows = rowsOf(blocks, blocks.map(initialChoice), context, all);
    expect(rows.map((row) => [row.block.id, row.status])).toEqual([
      [null, "unmatched"],
      ["V.01.WHO", "matched"],
      ["V.99.NOPE", "unknownId"],
      ["V.02.RED_1", "hidden"],
    ]);
  });

  test("outside the scope, and put on a question by hand", () => {
    const blocks = matched("## [V.02.OCEAN]\nred", {
      kind: "sections",
      keys: ["01"],
    });
    const scope = { kind: "sections", keys: ["01"] } as const;
    const [row] = rowsOf(blocks, blocks.map(initialChoice), context, scope);
    expect(row?.status).toBe("outOfScope");
    const [chosen] = rowsOf(
      blocks,
      [{ questionKey: "V.01.PROBLEM", discarded: false }],
      context,
      scope,
    );
    expect(chosen?.status).toBe("matched");
    expect(chosen?.answer).toEqual({ text: "red" });
  });

  test("two blocks on one question are duplicates until one is discarded", () => {
    const blocks = matched("## [V.01.WHO]\nOne\n## [V.01.WHO]\nTwo");
    const choices = blocks.map(initialChoice);
    const [first] = choices;
    if (first === undefined) throw new Error("no block");
    expect(
      rowsOf(blocks, choices, context, all).map((row) => row.status),
    ).toEqual(["duplicate", "duplicate"]);
    expect(
      rowsOf(
        blocks,
        [first, { questionKey: "V.01.WHO", discarded: true }],
        context,
        all,
      ).map((row) => row.status),
    ).toEqual(["matched", "discarded"]);
  });

  test("a block reads nothing for an amount question it is moved to", () => {
    const sa = selfAnalysisContext();
    const blocks = matchBlocks(
      parseAiReply("## [SA.WHY.1]\n(empty)"),
      { sections: sa.sections, questions: sa.questions, currency: "PHP" },
      all,
    );
    // An empty answer is left out (6.7 ①).
    expect(blocks).toEqual([]);
    const json = matchBlocks(
      parseAiReply(
        JSON.stringify({
          format: "moonx-reply",
          version: 1,
          answers: [{ id: "SA.INCOME.1", text: "thirty thousand" }],
        }),
      ),
      { sections: sa.sections, questions: sa.questions, currency: "PHP" },
      all,
    );
    expect(json.map((block) => block.status)).toEqual(["unmatched"]);
    const [row] = rowsOf(
      json,
      [{ questionKey: "SA.INCOME.1", discarded: false }],
      sa,
      all,
    );
    expect(row?.status).toBe("emptyFor");
  });
});

describe("review (③ Review)", () => {
  test("a changed answer, an unchanged one, and the change X3 is sent", () => {
    const who = review(
      question("V.01.WHO"),
      draftOf("V.01.WHO", { text: "Office workers aged 25–45." }, "PHP"),
      "PHP",
    );
    expect(who.isChanged).toBe(true);
    expect(changeOf(who)).toEqual({
      questionKey: "V.01.WHO",
      text: "Office workers aged 25–45.",
      baseLockVersion: 3,
    });
    const same = review(
      question("V.01.FREQUENCY"),
      draftOf("V.01.FREQUENCY", { text: "Every working day." }, "PHP"),
      "PHP",
    );
    expect(same.isChanged).toBe(false);
  });

  test("the F/A/U chosen again goes with the change; none leaves it Unclassified", () => {
    const draft = {
      ...draftOf("V.01.WHO", { text: "New" }, "PHP"),
      classification: {
        fau: "assumption" as const,
        confidence: "high" as const,
      },
    };
    expect(changeOf(review(question("V.01.WHO"), draft, "PHP"))).toMatchObject({
      classification: { fau: "assumption", confidence: "high" },
    });
    expect(
      changeOf(
        review(question("V.01.WHO"), { ...draft, classification: null }, "PHP"),
      ),
    ).not.toHaveProperty("classification");
  });

  test("a choice is written as the template spells it, and refused when it is none", () => {
    const red = review(
      question("V.02.OCEAN"),
      draftOf("V.02.OCEAN", { text: "red" }, "PHP"),
      "PHP",
    );
    expect(red.text).toBe("Red");
    expect(isValid(red)).toBe(true);
    const purple = review(
      question("V.02.OCEAN"),
      draftOf("V.02.OCEAN", { text: "Purple" }, "PHP"),
      "PHP",
    );
    expect(purple.textError).toBe("Use one of: Red, Blue, Mixed");
    expect(isValid(purple)).toBe(false);
  });

  test("too long for 6.0.8, and hidden since it was matched", () => {
    const long = review(
      question("V.01.WHO"),
      draftOf("V.01.WHO", { text: "x".repeat(20_001) }, "PHP"),
      "PHP",
    );
    expect(long.textError).toBe("Too long. Shorten to 20,000 characters.");
    const hidden = review(
      { ...question("V.01.WHO"), hidden: true },
      draftOf("V.01.WHO", { text: "Still here" }, "PHP"),
      "PHP",
    );
    expect(hidden.questionError).toBe("This question is hidden now");
    expect(isValid(hidden)).toBe(false);
    const gone = review(
      question("V.01.WHO"),
      draftOf("V.01.WHO", { text: "Still here" }, "PHP"),
      "PHP",
      true,
    );
    expect(gone.questionError).toBe(
      "This question is no longer in the template",
    );
  });

  test("an amount: read with its currency, refused when it does not read or is out of range", () => {
    const sa = selfAnalysisContext();
    const income = sa.questions[1];
    if (income === undefined) throw new Error("no income");
    const draft = draftOf(
      "SA.INCOME.1",
      { amount: { kind: "value", value: 35000.5 }, text: "Rent, food." },
      "PHP",
    );
    expect(draft.amount).toBe("35,000.5");
    const read = review(income, { ...draft, amount: "₱35,000" }, "PHP");
    expect(read.amount).toBe(35000);
    expect(read.isChanged).toBe(true);
    expect(changeOf(read)).toEqual({
      questionKey: "SA.INCOME.1",
      text: "Rent, food.",
      amount: 35000,
      baseLockVersion: 1,
    });
    const unreadable = review(income, { ...draft, amount: "30k" }, "PHP");
    expect(unreadable.amountError).toBe("Couldn't read the amount");
    expect(unreadable.isChanged).toBe(true);
    const negative = review(income, { ...draft, amount: "-5" }, "PHP");
    expect(negative.amountError).toBe("Enter 0 or more");
    // A third decimal shows as it is, so it is refused rather than rounded unseen.
    const precise = draftOf(
      "SA.INCOME.1",
      { amount: { kind: "value", value: 1.005 } },
      "PHP",
    );
    expect(precise.amount).toBe("1.005");
    expect(review(income, precise, "PHP").amountError).toBe(
      "Use at most 2 decimal places",
    );
    // Only the amount: the reason stays as it is.
    const amountOnly = draftOf(
      "SA.INCOME.1",
      { amount: { kind: "value", value: 30000 } },
      "PHP",
    );
    expect(review(income, amountOnly, "PHP").isChanged).toBe(false);
  });
});
