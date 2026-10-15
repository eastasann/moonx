import { selfAnalysisAnswerContent } from "../history-values";
import {
  selfAnalyses,
  selfAnalysisAnswers,
  selfAnalysisShares,
} from "../schema";
import {
  BCDX_WORKSPACE_ID,
  type SeedContext,
  type UserKey,
  userId,
} from "./context";
import { seedId } from "./ids";
import {
  type Earlier,
  type Edit,
  firstAndLast,
  recordRevisions,
} from "./revisions";

interface AnswerState {
  text: string;
  /** Q15–17 only: the amount, in the self-analysis currency. */
  amount?: number;
}

type AnswerSpec = AnswerState & {
  edit?: Edit;
  earlier?: Earlier<AnswerState>;
};

interface SelfAnalysisSpec {
  status: "not_started" | "in_progress" | "done";
  startedDaysAgo: number;
  /** Done only. */
  completedDaysAgo?: number;
  /** Shared with BCDX this many days ago; omitted when not shared. */
  sharedDaysAgo?: number;
  /** When answers without an `edit` were saved. */
  answeredDaysAgo: number;
  answers: Record<string, AnswerSpec>;
}

const ANA: SelfAnalysisSpec = {
  status: "done",
  startedDaysAgo: 90,
  completedDaysAgo: 70,
  sharedDaysAgo: 69,
  answeredDaysAgo: 80,
  answers: {
    "SA.WHY.1": {
      text: "I want to build something that keeps my family's piaya recipe alive and gives work to people in our barangay.",
      edit: { daysAgo: 72, by: "ana" },
      earlier: [
        {
          text: "I want to keep my family's piaya recipe alive.",
          daysAgo: 89,
          by: "ana",
          client: "web_mobile",
        },
      ],
    },
    "SA.WHY.2": {
      text: "My grandmother's bakery closed when I was in college. I still feel I owe it a second life.",
    },
    "SA.BE.1": {
      text: "Someone who runs a calm, profitable business and mentors younger women starting out in Bacolod.",
    },
    "SA.BE.2": {
      text: "Because the people who helped me most were business owners who made time for me.",
    },
    "SA.DO.1": {
      text: "Developing products, talking with customers and building relationships with offices and schools.",
    },
    "SA.DO.2": {
      text: "Bookkeeping, chasing payments and doing deliveries myself.",
    },
    "SA.DO.3": {
      text: "I lose energy on admin work and gain it when I am making something people enjoy.",
    },
    "SA.GIVE.1": {
      text: "Office workers who want a thoughtful local gift, and home bakers who need steady income.",
    },
    "SA.GIVE.2": {
      text: "A dependable way to give something that feels personal and from Bacolod.",
    },
    "SA.GIVE.3": {
      text: "Local food is how we show care here. I want that to be easy, not a chore.",
    },
    "SA.HAVE.1": {
      text: "Bacolod, close to my parents, within 20 minutes of the city centre.",
    },
    "SA.HAVE.2": {
      text: "I want my children to grow up near their grandparents and not spend hours in traffic.",
    },
    "SA.HAVE.3": {
      text: "Weekdays from 8 to 5, with Sundays free and one long holiday a year.",
    },
    "SA.HAVE.4": {
      text: "I burned out working nights before. A business that needs me every evening is not worth it.",
    },
    "SA.INCOME.1": {
      text: "Covers rent, school fees and food for our household.",
      amount: 40000,
    },
    "SA.INCOME.2": {
      text: "Lets us save for the children's college and travel once a year.",
      amount: 75000,
    },
    "SA.INCOME.3": {
      text: "Would let me help my parents fully and invest in a second business.",
      amount: 150000,
    },
    "SA.ENOUGH.1": {
      text: "Around ₱150,000 a month. Beyond that, more money would not change how we live.",
    },
    "SA.ENOUGH.2": {
      text: "A team of 6 to 8 people and a kitchen that runs without me there every day.",
    },
    "SA.ENOUGH.3": {
      text: "That size still lets me know every customer and every employee by name.",
    },
    "SA.ENOUGH.4": {
      text: "45 hours a week for the first year, then 35.",
    },
    "SA.NOT.1": {
      text: "Sunday family lunch, my health and my children's school events.",
    },
    "SA.NOT.2": {
      text: "A big business where I spend all day in meetings and never touch the product.",
    },
    "SA.NOT.3": {
      text: "Anything that depends on selling to people who do not need it.",
    },
    "SA.NOT.4": {
      text: "If it needed me to work nights for more than a year, or put my family's savings at risk twice.",
    },
    "SA.NOW.1": {
      text: "About 40 hours a week from January, when my current contract ends.",
    },
    "SA.NOW.2": {
      text: "₱250,000 of my own savings, without touching the emergency fund.",
    },
    "SA.NOW.3": {
      text: "Baking, product development, corporate sales from my years in HR.",
    },
    "SA.NOW.4": {
      text: "HR contacts at about 20 Bacolod offices, and my aunt's commissary kitchen.",
    },
    "SA.NOW.5": {
      text: "I cannot drive, and I need to be home by 6 for the children.",
    },
    "SA.FINAL.1": {
      text: "A full life in Bacolod with time for family, work I am proud of and money I do not worry about.",
    },
    "SA.FINAL.2": {
      text: "A steady, generous business owner people trust.",
    },
    "SA.FINAL.3": {
      text: "Enough is when the business pays my target income and runs well when I take a week off.",
    },
    "SA.FINAL.4": {
      text: "Doing work that carries my family's story and supports other families.",
    },
    "SA.FINAL.5": {
      text: "Business is the tool that funds this life, not the life itself.",
    },
    "SA.ONE.1": {
      text: "A calm life in Bacolod, built on a small food business that carries my family's recipe and pays for the life we want.",
      edit: {
        daysAgo: 70,
        hoursAgo: 2,
        by: "ana",
        source: "revert",
        revertTo: 0,
      },
      earlier: [
        { daysAgo: 71, by: "ana" },
        {
          text: "A calm, balanced life in Bacolod supported by a meaningful local food business that honours family heritage.",
          daysAgo: 70,
          hoursAgo: 4,
          by: "ana",
          source: "ai_import",
          batch: "self-analysis/ana/ai-import",
        },
      ],
    },
  },
};

const PAOLO: SelfAnalysisSpec = {
  status: "done",
  startedDaysAgo: 88,
  completedDaysAgo: 75,
  sharedDaysAgo: 74,
  answeredDaysAgo: 82,
  answers: {
    "SA.WHY.1": {
      text: "I want to own my time and build something students actually use.",
      edit: { daysAgo: 78, by: "paolo" },
      earlier: [{ text: "I want to own my time.", daysAgo: 87, by: "paolo" }],
    },
    "SA.WHY.2": {
      text: "Ten years in university IT taught me I like fixing things for people, not reporting to five bosses.",
    },
    "SA.BE.1": {
      text: "A practical owner who knows his numbers and treats staff well.",
    },
    "SA.BE.2": {
      text: "My father ran a hardware store badly and lost it. I want to prove it can be done right.",
    },
    "SA.DO.1": {
      text: "Setting up systems, improving how things run, talking to students.",
    },
    "SA.DO.2": { text: "Selling to people who do not want to buy." },
    "SA.DO.3": {
      text: "I am good at operations and bad at pushing a sale.",
    },
    "SA.GIVE.1": {
      text: "University students in Bacolod and the people who work for me.",
    },
    "SA.GIVE.2": {
      text: "A quiet, safe place to study and fair jobs with predictable hours.",
    },
    "SA.GIVE.3": {
      text: "I studied in noisy boarding houses. A good place to study changed my grades.",
    },
    "SA.HAVE.1": { text: "Bacolod, near the university belt." },
    "SA.HAVE.2": {
      text: "I like being able to walk or bike to everything I need.",
    },
    "SA.HAVE.3": {
      text: "Flexible during the week, but off on Sundays.",
    },
    "SA.HAVE.4": {
      text: "My partner works weekends, so Sunday is our only day together.",
    },
    "SA.INCOME.1": {
      text: "Rent, food, my share of my mother's medicine.",
      amount: 35000,
    },
    "SA.INCOME.2": {
      text: "Lets us save and pay for a small wedding.",
      amount: 60000,
    },
    "SA.INCOME.3": {
      text: "Would let me open a second branch without a bank loan.",
      amount: 120000,
    },
    "SA.ENOUGH.1": { text: "Around ₱120,000 a month." },
    "SA.ENOUGH.2": {
      text: "Two branches that each pay for themselves.",
    },
    "SA.ENOUGH.3": {
      text: "Beyond two, I would spend my time managing managers.",
    },
    "SA.ENOUGH.4": { text: "50 hours a week in the first year." },
    "SA.NOT.1": { text: "Sundays and my mother's care." },
    "SA.NOT.2": {
      text: "A café that only survives by underpaying staff.",
    },
    "SA.NOT.3": { text: "Anything built on alcohol or gambling." },
    "SA.NOT.4": {
      text: "If it still lost money after 18 months.",
    },
    "SA.NOW.1": {
      text: "Evenings and weekends now; full time once the café breaks even.",
    },
    "SA.NOW.2": { text: "₱180,000 in savings." },
    "SA.NOW.3": {
      text: "Networks, POS and booking systems, scheduling, basic accounting.",
    },
    "SA.NOW.4": {
      text: "Student organisations at two universities, and a cousin who does carpentry.",
    },
    "SA.NOW.5": {
      text: "My university contract runs until March.",
    },
    "SA.FINAL.1": {
      text: "A simple life near the university belt, with work that runs on systems I built.",
    },
    "SA.FINAL.2": {
      text: "A fair employer who knows his business inside out.",
    },
    "SA.FINAL.3": {
      text: "Enough is two stable branches and Sundays off.",
    },
    "SA.FINAL.4": {
      text: "Building places that make other people's lives a little easier.",
    },
    "SA.FINAL.5": {
      text: "The business gives me independence; the rest of life gives it meaning.",
    },
    "SA.ONE.1": {
      text: "An independent life near the university belt, running a study café that pays fairly and lets me keep Sundays.",
    },
  },
};

/** 21 of 36 answered (design-spec 8.1), in the sections screen 10 shows partly done. */
const KENJI: SelfAnalysisSpec = {
  status: "in_progress",
  startedDaysAgo: 40,
  answeredDaysAgo: 30,
  answers: {
    "SA.WHY.1": {
      text: "I want to build a business in the city I chose to live in, not just work here.",
      edit: {
        daysAgo: 6,
        by: "kenji",
        source: "ai_import",
        batch: "self-analysis/kenji/ai-import",
      },
      earlier: [{ text: "To stay in Bacolod.", daysAgo: 39, by: "kenji" }],
    },
    "SA.WHY.2": {
      text: "I moved here for my wife's family. Owning something local makes it home.",
    },
    "SA.BE.1": {
      text: "Someone known for honest food and well-run kitchens.",
    },
    "SA.BE.2": {
      text: "I spent 12 years cooking for other people's restaurants in Osaka.",
    },
    "SA.DO.1": {
      text: "Cooking, menu design, training kitchen staff.",
    },
    "SA.GIVE.1": {
      text: "Office workers who eat badly because nothing healthy is close.",
    },
    "SA.GIVE.2": {
      text: "A filling, healthy lunch at a price they can pay every day.",
    },
    "SA.GIVE.3": {
      text: "My father had diabetes. Food habits matter.",
    },
    "SA.HAVE.1": { text: "Bacolod, near my wife's parents." },
    "SA.HAVE.2": {
      text: "Family is close and the city is small enough to bike.",
    },
    "SA.HAVE.3": {
      text: "Early mornings, afternoons free after the lunch rush.",
    },
    "SA.HAVE.4": {
      text: "I want to pick up my daughter from school.",
    },
    "SA.INCOME.1": {
      text: "Our share of the household costs.",
      amount: 50000,
    },
    "SA.INCOME.2": {
      text: "Lets us visit Japan once a year.",
      amount: 90000,
    },
    "SA.INCOME.3": {
      text: "Would let us buy a house without a long loan.",
      amount: 180000,
    },
    "SA.ENOUGH.1": { text: "About ₱180,000 a month." },
    "SA.ENOUGH.2": {
      text: "Two kitchens supplying offices across the city.",
    },
    "SA.ENOUGH.3": {
      text: "More than that would take me out of the kitchen.",
    },
    "SA.ENOUGH.4": {
      text: "55 hours a week at first.",
      edit: { daysAgo: 6, hoursAgo: 1, by: "kenji", client: "web_mobile" },
      earlier: [{ text: "60 hours a week.", daysAgo: 31, by: "kenji" }],
    },
    "SA.NOT.1": { text: "My daughter's school mornings." },
    "SA.NOT.2": {
      text: "A franchise that tells me what to cook.",
    },
  },
};

const GRACE: SelfAnalysisSpec = {
  status: "not_started",
  startedDaysAgo: 55,
  answeredDaysAgo: 55,
  answers: {},
};

/** Admin has none: it is made the first time Admin opens 10 (design-spec 6.11). */
const SPECS: Partial<Record<UserKey, SelfAnalysisSpec>> = {
  ana: ANA,
  kenji: KENJI,
  paolo: PAOLO,
  grace: GRACE,
};

export const selfAnalysisId = (user: UserKey) => seedId("self_analysis", user);

/** The self-analyses of design-spec 8.1, with history on a few answers each. */
export async function seedSelfAnalyses({
  tx,
  clock,
  templates,
  history,
}: SeedContext): Promise<void> {
  for (const [user, spec] of Object.entries(SPECS) as [
    UserKey,
    SelfAnalysisSpec,
  ][]) {
    const id = selfAnalysisId(user);
    const container = {
      type: "self_analysis" as const,
      id,
      workspaceId: null,
      ownerUserId: userId(user),
    };
    const at = (when: { daysAgo: number; hoursAgo?: number }) =>
      clock.ago(when.daysAgo, when.hoursAgo);
    const answerRows = Object.entries(spec.answers).map(([key, answer]) => {
      const edit = answer.edit ?? { daysAgo: spec.answeredDaysAgo, by: user };
      const earlier = answer.earlier ?? [];
      const { first, last } = firstAndLast(
        recordRevisions(
          history,
          at,
          {
            container,
            sectionKey: key.split(".")[1] ?? null,
            target: { type: "self_analysis_answer", id, key },
          },
          { state: { text: answer.text, amount: answer.amount }, edit },
          earlier,
          selfAnalysisAnswerContent,
        ),
      );
      return {
        id: seedId("self_analysis_answer", user, key),
        selfAnalysisId: id,
        questionKey: key,
        text: answer.text,
        amount: answer.amount ?? null,
        lockVersion: earlier.length + 1,
        updatedById: userId(edit.by),
        createdAt: first,
        updatedAt: last,
      };
    });
    const completedAt =
      spec.completedDaysAgo === undefined
        ? null
        : clock.ago(spec.completedDaysAgo);
    // The row's own content changes with its status: the first answer makes it in
    // progress, Mark as done makes it done.
    const firstAnswer = answerRows.reduce<Date | null>(
      (earliest, row) =>
        earliest === null || row.createdAt < earliest
          ? row.createdAt
          : earliest,
      null,
    );
    await tx.insert(selfAnalyses).values({
      id,
      userId: userId(user),
      templateVersionId: templates.selfAnalysis,
      currency: "PHP",
      status: spec.status,
      completedAt,
      createdAt: clock.ago(spec.startedDaysAgo),
      updatedAt: completedAt ?? firstAnswer ?? clock.ago(spec.startedDaysAgo),
    });
    if (answerRows.length > 0)
      await tx.insert(selfAnalysisAnswers).values(answerRows);
    if (spec.sharedDaysAgo !== undefined)
      await tx.insert(selfAnalysisShares).values({
        id: seedId("self_analysis_share", user, "bcdx"),
        selfAnalysisId: id,
        workspaceId: BCDX_WORKSPACE_ID,
        sharedAt: clock.ago(spec.sharedDaysAgo),
        createdAt: clock.ago(spec.sharedDaysAgo),
        updatedAt: clock.ago(spec.sharedDaysAgo),
      });
  }
}
