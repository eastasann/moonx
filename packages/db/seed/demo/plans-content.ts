import type { ExecutionPlanSpec, PlanAnswerSpec } from "./plans";

/**
 * Hand-written plan answers for Piaya Plan A. They cover what the one-minute and five-minute
 * Pitch Decks read (design-spec 6.14), so every slide has its material.
 */
export const piayaPlanAnswers: Record<string, PlanAnswerSpec> = {
  "P.01.5": {
    text: "Box sales to offices and families at ₱450 with a delivery slot included, plus monthly subscriptions for offices.",
  },
  "P.01.6": {
    text: "Delivery fills a gap that walk-in sellers leave open, and each box leaves about half of the price as contribution.",
  },
  "P.02.1": { text: "Make sending a local gift on time as easy as ordering lunch." },
  "P.02.2": {
    text: "A reliable gifting brand for Bacolod offices, profitable without founder labor every day.",
  },
  "P.02.3": { text: "A proven delivery model that can add other local products or other cities." },
  "P.02.4": { text: "We will not compete as the cheapest seller or depend on tourists." },
  "P.03.4": {
    text: "A client gift deadline or a family occasion, with a delivery slot that fits.",
  },
  "P.05.3": {
    text: "Order online, choose a delivery slot, receive a boxed gift with a card, and reorder in two taps.",
  },
  "P.06.5": {
    text: "Airport shop (₱380), mall kiosk (₱420), Facebook sellers (₱350) and relatives who pick up and ship.",
  },
  "P.06.7": { text: "Fixed delivery slots, gift-ready packaging and invoicing for offices." },
  "P.06.8": { text: "Existing sellers rely on walk-in traffic and never built delivery." },
  "P.08.1": { text: "Gift box sales to offices and families." },
  "P.08.2": { text: "Monthly office subscriptions after the pilot." },
  "P.08.11": {
    text: "The startup cost pays back in about nine months at the expected volume, if the supplier quotes hold.",
  },
  "P.10.1": { text: "Local knowledge, the BCDX network of offices and a working order form." },
  "P.10.2": { text: "Food production experience." },
  "P.10.3": { text: "Contract a licensed bakery and keep production outside the company." },
  "P.11.1": {
    rows: [
      {
        name: "Ana Villanueva",
        role: "Lead",
        responsibilities: "Customers, suppliers and finance",
        authority: "Spending up to ₱20,000",
        time: "20 hours a week",
      },
      {
        name: "Kenji Mori",
        role: "Operations",
        responsibilities: "Delivery, packing and permits",
        authority: "Delivery routes and staffing",
        time: "15 hours a week",
      },
      {
        name: "Paolo Gonzaga",
        role: "Marketing",
        responsibilities: "Sales to offices and social media",
        authority: "Marketing spend up to ₱5,000",
        time: "10 hours a week",
      },
    ],
  },
  "P.11.2": { text: "Pricing and the supplier contract." },
  "P.13.1": {
    rows: [
      { name: "Ana Villanueva", ownership: 0.4, capital: 70000 },
      { name: "Kenji Mori", ownership: 0.3, capital: 50000 },
      { name: "Paolo Gonzaga", ownership: 0.3, capital: 50000 },
    ],
  },
  "P.20.2": { text: "₱40,000 kept as the working capital buffer." },
  "P.20.10": { text: "About seven months at the conservative scenario." },
  "P.20.11": {
    text: "If cash falls below ₱20,000, each founder may lend up to ₱30,000 after a majority vote.",
  },
  "P.24.1": {
    text: "Pilot offices reorder, the bakery signs a supply agreement, and permits cost no more than ₱10,000.",
  },
  "P.24.2": {
    text: "The supplier quote or the permit check is still pending, or fewer than five offices join the pilot.",
    editedDaysAgo: 2,
    previousText: "The supplier quote or the permit check is still pending.",
  },
  "P.24.3": {
    text: "Pilot offices choose cheaper sellers or the bakery refuses peak-season supply.",
  },
  "P.27.1": { text: "Orders, late deliveries and complaints." },
  "P.27.2": { text: "Sales, contribution per box, stock and delivery on-time rate." },
  "P.27.3": { text: "Profit and loss, cash position and the key assumptions." },
  "P.30.1": {
    text: "Offices in Bacolod struggle to send gifts on time. We deliver gift-ready boxes of piaya in fixed slots for ₱450. At ten boxes a day we earn ₱18,490 a month and pay back in about nine months. Next, we sign the bakery and run a pilot with five offices.",
  },
  "P.30.2": {
    text: "Problem, customer and solution as in the one-minute version. The market is mixed: many sellers, none that delivers. Competitors charge ₱350–₱420 and sell out at peak times. At the expected volume the business earns ₱18,490 a month on ₱117,000 of revenue, breaks even at about seven boxes a day, and recovers the ₱169,500 startup cost in about nine months. The main risks are a single bakery and holiday-only demand. We ask advisors to review the plan before we commit to the lease.",
  },
};

export const studyCafePlanAnswers: Record<string, PlanAnswerSpec> = {
  "P.01.5": { text: "Paid study seats by the hour, plus drinks and monthly passes." },
  "P.01.6": {
    text: "Students already pay for coffee to get a seat, and exam seasons fill every table.",
  },
  "P.24.1": { text: "The lease is signed at ₱30,000 a month and the permits are approved." },
  "P.24.2": { text: "The landlord delays the fit-out beyond the exam season." },
  "P.24.3": { text: "Permits are refused or rent rises above ₱40,000 a month." },
  "P.30.1": {
    text: "Students in Bacolod lack quiet seats. We rent out seats with outlets and Wi-Fi near campus. At 40 seats a day we make about ₱21,000 a month.",
  },
};

export const piayaExecution: ExecutionPlanSpec = {
  preset: {
    "milestone:0": {
      status: "done",
      assignee: "ana",
      dueInDays: -10,
      goal: "Decide to develop the plan",
      exitCondition: "Advisors have reviewed plan v1",
    },
    "milestone:1": {
      status: "doing",
      assignee: "paolo",
      dueInDays: 14,
      goal: "Register the business and obtain the permits",
      exitCondition: "All three permits in hand",
    },
    "milestone:2": {
      status: "todo",
      assignee: "kenji",
      dueInDays: 30,
      goal: "Sign the bakery agreement and the stall lease",
      exitCondition: "Both agreements signed",
    },
    "milestone:3": {
      status: "todo",
      assignee: "ana",
      dueInDays: 45,
      goal: "Finish the box design and run a tasting",
      exitCondition: "Five reviewers approve the box",
    },
    "milestone:4": {
      status: "todo",
      assignee: { name: "To be hired" },
      dueInDays: 45,
      goal: "Hire one packer",
      exitCondition: "Packer trained on the checklist",
    },
    "milestone:5": {
      status: "todo",
      assignee: "ana",
      dueInDays: 60,
      goal: "Everything needed for the first delivery day is ready",
      exitCondition: "Dry run of ten deliveries passes",
    },
    "launch:0": {
      assignee: "ana",
      dueInDays: 30,
      actions: "Sign the bakery agreement and finish the box design",
      completionCriteria: "Agreement signed and design approved",
    },
    "launch:1": {
      assignee: "kenji",
      dueInDays: 53,
      actions: "Dry-run delivery slots with the pilot offices",
      completionCriteria: "Ten deliveries on time",
    },
    "kpi:0": {
      assignee: "ana",
      kpiTarget: "₱117,000 a month",
      kpiReviewFrequency: "Monthly",
    },
    "kpi:1": {
      assignee: "ana",
      kpiTarget: "₱18,490 a month",
      kpiReviewFrequency: "Monthly",
    },
    "kpi:2": { assignee: "ana", kpiTarget: "51%", kpiReviewFrequency: "Monthly" },
    "kpi:4": { assignee: "kenji", kpiTarget: "10 a day", kpiReviewFrequency: "Weekly" },
  },
  extra: [
    {
      type: "next_action",
      title: "Get the written supply quote from the bakery",
      assignee: "ana",
      dueInDays: -3,
      status: "todo",
    },
    {
      type: "next_action",
      title: "Confirm permit requirements with City Hall",
      assignee: "kenji",
      dueInDays: 2,
      status: "doing",
    },
    {
      type: "next_action",
      title: "Test delivery slots with five offices",
      assignee: "paolo",
      dueInDays: 7,
      status: "todo",
    },
    {
      type: "next_action",
      title: "Draft the box mockups",
      assignee: "ana",
      dueInDays: -5,
      status: "done",
    },
    {
      type: "open_question",
      title: "Can the bakery guarantee peak-season supply?",
      assignee: "ana",
      dueInDays: 10,
      status: "open",
      whyItMatters: "A supply failure stops every order.",
    },
  ],
};

export const piayaPlanBExecution: ExecutionPlanSpec = { preset: {}, extra: [] };

export const studyCafeExecution: ExecutionPlanSpec = {
  preset: {
    "milestone:0": {
      status: "done",
      assignee: "paolo",
      dueInDays: -70,
      goal: "Decide to proceed",
      exitCondition: "Plan v1 reviewed",
    },
    "milestone:1": {
      status: "done",
      assignee: "paolo",
      dueInDays: -55,
      goal: "Register and get permits",
      exitCondition: "Permits approved",
    },
    "milestone:2": {
      status: "done",
      assignee: "kenji",
      dueInDays: -45,
      goal: "Sign the lease",
      exitCondition: "Lease signed",
    },
    "milestone:3": {
      status: "done",
      assignee: "paolo",
      dueInDays: -35,
      goal: "Finish the fit-out",
      exitCondition: "Seats and outlets installed",
    },
    "milestone:4": {
      status: "done",
      assignee: "paolo",
      dueInDays: -30,
      goal: "Hire two baristas",
      exitCondition: "Baristas trained",
    },
    "milestone:5": {
      status: "done",
      assignee: "paolo",
      dueInDays: -26,
      goal: "Ready to open",
      exitCondition: "Soft opening done",
    },
    "launch:0": {
      status: "done",
      assignee: "paolo",
      dueInDays: -55,
      actions: "Order furniture",
      completionCriteria: "Delivered",
    },
    "launch:1": {
      status: "done",
      assignee: "paolo",
      dueInDays: -33,
      actions: "Soft opening for 20 students",
      completionCriteria: "Feedback collected",
    },
    "launch:2": {
      status: "done",
      assignee: "paolo",
      dueInDays: -26,
      actions: "Open the doors",
      completionCriteria: "First paid seats",
    },
    "launch:3": {
      status: "doing",
      assignee: "paolo",
      dueInDays: 4,
      actions: "Track visits and fix the booking flow",
      completionCriteria: "30 paid seats a day",
    },
    "kpi:0": {
      assignee: "paolo",
      kpiTarget: "₱160,000 a month",
      kpiReviewFrequency: "Monthly",
      kpiActual: "₱148,000 in September",
    },
    "kpi:1": {
      assignee: "paolo",
      kpiTarget: "₱20,000 a month",
      kpiReviewFrequency: "Monthly",
      kpiActual: "₱12,500 in September",
    },
    "kpi:3": {
      assignee: "paolo",
      kpiTarget: "₱150,000",
      kpiReviewFrequency: "Weekly",
      kpiActual: "₱182,000",
    },
    "kpi:4": {
      assignee: "paolo",
      kpiTarget: "40 a day",
      kpiReviewFrequency: "Weekly",
      kpiActual: "36 a day",
    },
  },
  extra: [
    {
      type: "next_action",
      title: "Add a monthly pass",
      assignee: "paolo",
      dueInDays: 12,
      status: "todo",
    },
    {
      type: "next_action",
      title: "Review the September numbers with advisors",
      assignee: "kenji",
      dueInDays: -2,
      status: "done",
    },
  ],
};
