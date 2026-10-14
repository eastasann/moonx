import type { IdeaSpec } from "../ideas";
import type { PlanSpec } from "../plans";

/**
 * Student Study Café (design-spec 8.2): Proceed, then Plan A saved as "v1 Launch review"
 * and Launch recorded, so the idea is in Launch prep. Plan B is archived.
 */
export const STUDY_CAFE: IdeaSpec = {
  key: "study-cafe",
  name: "Student Study Café",
  oneLineConcept:
    "A quiet study café near the university belt with reserved seats, fast Wi-Fi and coffee, paid by the block.",
  proposedSolution:
    "40 seats on a rented second floor near USLS and UNO-R. ₱150 for a 3-hour block with one drink; group rooms by reservation.",
  proposer: "paolo",
  createdDaysAgo: 80,
  template: "v1",
  workedDaysAgo: 66,
  researchLogs: [
    {
      key: "cafe-prices",
      daysAgo: 75,
      topic: "Coffee shop prices near the universities",
      observation:
        "A drink costs ₱120–₱180 at the four cafés near USLS; students stay 2–4 hours on one drink.",
      sourceType: "price_check",
      supports: ["local_price"],
      by: "paolo",
    },
    {
      key: "student-survey",
      daysAgo: 73,
      topic: "Survey of 85 students in two organisations",
      observation:
        "61 would pay ₱150 for 3 quiet hours with Wi-Fi and a drink, mostly during exams.",
      sourceType: "other",
      supports: ["demand_signal"],
      by: "paolo",
    },
    {
      key: "permits",
      daysAgo: 70,
      topic: "Permits for a café in a commercial building",
      observation:
        "Mayor's permit, sanitary permit, fire safety inspection and BIR: about ₱9,000.",
      sourceType: "public_data",
      sourceUrl: "https://bacolodcity.gov.ph/business-permits",
      supports: ["permits"],
      by: "paolo",
    },
  ],
  competitors: [
    {
      name: "Coffee chains on Lacson St.",
      type: "direct",
      offering: "Coffee and seats, no time limit",
      typicalPrice: 180,
      priceNote: "per drink",
      strength: "Brand and location",
      weakness: "Noisy and full during exams",
    },
    {
      name: "Co-working space downtown",
      type: "indirect",
      offering: "Desks for freelancers",
      typicalPrice: 350,
      priceNote: "per day",
      strength: "Quiet and reliable Wi-Fi",
      weakness: "Too expensive for students, far from campus",
    },
    {
      name: "University libraries",
      type: "substitute",
      offering: "Free study space",
      strength: "Free",
      weakness: "Closes at 7 p.m. and on Sundays",
    },
  ],
  assumptions: [
    {
      statement:
        "Students will book 3-hour blocks during exam weeks and on weekends.",
      whyBelieve: "61 of 85 surveyed students said they would.",
      confidence: "medium",
      evidence: [{ log: "student-survey" }],
    },
    {
      statement: "Group rooms fill on weekday evenings.",
      confidence: "low",
    },
  ],
  risks: [
    {
      statement: "Demand collapses during semester breaks.",
      probability: "high",
      impact: "medium",
      mitigation: "Offer review-centre groups and freelancers a monthly pass.",
    },
    {
      statement: "Wi-Fi outages drive students away.",
      probability: "medium",
      impact: "high",
      mitigation: "Two internet providers with automatic failover.",
    },
  ],
  costs: {
    "initial.equipment": {
      amount: 80000,
      fau: "assumption",
      confidence: "high",
    },
    "initial.renovation": {
      amount: 120000,
      fau: "assumption",
      confidence: "medium",
    },
    "initial.lease_deposit": {
      amount: 50000,
      fau: "assumption",
      confidence: "high",
    },
    "initial.permits": {
      amount: 9000,
      fau: "fact",
      evidence: [{ log: "permits" }],
    },
    "initial.inventory": {
      amount: 15000,
      fau: "assumption",
      confidence: "medium",
    },
    "initial.branding": {
      amount: 15000,
      fau: "assumption",
      confidence: "high",
    },
    "initial.launch_marketing": {
      amount: 12000,
      fau: "assumption",
      confidence: "medium",
    },
    "initial.tech_setup": {
      amount: 25000,
      fau: "assumption",
      confidence: "high",
    },
    "initial.working_capital": {
      amount: 60000,
      fau: "assumption",
      confidence: "medium",
    },
    "initial.other": { amount: 0, fau: "assumption", confidence: "high" },
    "monthly.rent": { amount: 25000, fau: "assumption", confidence: "high" },
    "monthly.salaries": {
      amount: 36000,
      fau: "assumption",
      confidence: "high",
    },
    "monthly.utilities": {
      amount: 9000,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.internet": { amount: 3500, fau: "assumption", confidence: "high" },
    "monthly.accounting": {
      amount: 2500,
      fau: "assumption",
      confidence: "high",
    },
    "monthly.marketing": {
      amount: 4000,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.insurance": {
      amount: 1500,
      fau: "assumption",
      confidence: "high",
    },
    "monthly.other": { amount: 0, fau: "assumption", confidence: "high" },
    "variable.materials": { amount: 35, fau: "assumption", confidence: "high" },
    "variable.packaging": { amount: 5, fau: "assumption", confidence: "high" },
    "variable.payment_fee": {
      percent: 0.02,
      fau: "assumption",
      confidence: "high",
    },
    "variable.delivery": { amount: 0, fau: "assumption", confidence: "high" },
    "variable.labor": { amount: 0, fau: "assumption", confidence: "high" },
    "variable.other": { amount: 0, fau: "assumption", confidence: "high" },
  },
  economics: {
    selling_price: {
      value: 150,
      fau: "fact",
      evidence: [{ log: "student-survey" }],
    },
    operating_days: { value: 28, fau: "assumption", confidence: "high" },
    target_margin: { value: 0.2, fau: "assumption", confidence: "medium" },
    units_conservative: { value: 25, fau: "assumption", confidence: "medium" },
    units_expected: { value: 40, fau: "assumption", confidence: "medium" },
    units_strong: { value: 60, fau: "assumption", confidence: "low" },
    units_capacity: { value: 90, fau: "assumption", confidence: "high" },
  },
  answers: {
    "V.01.WHO": {
      text: "University students near USLS and UNO-R who need a quiet place to study for 2–4 hours.",
      fau: "fact",
      evidence: [{ log: "student-survey" }],
    },
    "V.01.BEHAVIOR": {
      text: "They study in coffee shops on one drink, or at the library until it closes.",
      fau: "fact",
      evidence: [{ log: "cafe-prices" }],
    },
    "V.01.PROBLEM": {
      text: "No quiet, reliable place to study after 7 p.m. and on Sundays.",
      fau: "fact",
      evidence: [{ log: "student-survey" }],
    },
    "V.01.FREQUENCY": {
      text: "Every exam week, and most weekends.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.01.PAYMENT": {
      text: "A guaranteed seat, quiet and fast Wi-Fi for the price of a drink.",
      fau: "assumption",
      confidence: "high",
    },
    "V.01.NON_CUSTOMER": {
      text: "Students who want a social café to meet friends.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.CATEGORY": {
      text: "Study spaces",
      fau: "assumption",
      confidence: "high",
    },
    "V.02.OCEAN": { text: "Mixed", fau: "assumption", confidence: "medium" },
    "V.02.WHY": {
      text: "Cafés compete for students, but none are built for quiet study.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.BLUE_1": {
      text: "Reserved, quiet seats in the evening and on Sundays.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.REACHABLE": {
      text: "About 3,000 students within walking distance.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.SHARE": {
      text: "About 30 blocks a day, or 1% of reachable students once a week.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.04.SURVIVOR_PATTERNS": {
      text: "Cafés near campus survive on exam-week peaks and loyal regulars.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.08.WORTH": {
      text: "Yes: about a year to pay back, and the space can host review classes in the off season.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.10.WHY_WORK": {
      text: "Students already pay for café seats they cannot rely on.",
      fau: "assumption",
      confidence: "high",
    },
    "V.10.BIGGEST_RISK": {
      text: "Semester breaks with no one studying.",
      fau: "assumption",
      confidence: "medium",
    },
  },
};

/** Plan A: saved as "v1 Launch review" before Launch; KPI actuals since the launch. */
export const STUDY_CAFE_PLAN_A: PlanSpec = {
  key: "a",
  name: "Plan A",
  businessName: "Quiet Hours Study Café",
  creator: "paolo",
  createdDaysAgo: 59,
  editedDaysAgo: 40,
  version: { name: "v1 Launch review", savedDaysAgo: 30, by: "paolo" },
  answers: {
    "P.01.5": {
      text: "3-hour study blocks at ₱150 with a drink, plus group room bookings.",
    },
    "P.01.6": {
      text: "Students already pay for café seats; we make the seat quiet and guaranteed.",
    },
    "P.02.1": {
      text: "Every student near the university belt deserves a quiet place to study.",
    },
    "P.05.2": { text: "Food beyond pastries, and overnight hours." },
    "P.05.3": {
      text: "Book a seat on Messenger, walk in, study three hours undisturbed.",
    },
    "P.06.5": {
      text: "Coffee chains, a co-working space and the university libraries.",
    },
    "P.06.7": {
      text: "Guarantee quiet and a seat, and stay open until midnight.",
    },
    "P.08.1": { text: "Study blocks at ₱150, sold at the counter and online." },
    "P.10.1": {
      text: "Paolo knows the students and the campus IT setup after ten years at the university.",
    },
    "P.11.1": {
      rows: [
        {
          name: "Paolo Gonzaga",
          role: "Founder and manager",
          responsibilities: "Operations, systems, staff",
          authority: "All decisions",
          time: "Full time",
        },
      ],
    },
    "P.24.1": {
      text: "Lease signed, renovation done and 100 students pre-registered.",
    },
    "P.24.2": { text: "Renovation runs more than 3 weeks late." },
    "P.24.3": {
      text: "Fewer than 30 pre-registrations a week before opening.",
    },
    "P.30.1": {
      text: "A quiet study café for students near USLS and UNO-R: a guaranteed seat, fast Wi-Fi and a drink for ₱150.",
    },
  },
  presets: {
    "Business decision": [
      { status: "done", assignee: "paolo", dueInDays: -58, daysAgo: 58 },
    ],
    "Legal / company setup": [
      { status: "done", assignee: "paolo", dueInDays: -45, daysAgo: 46 },
    ],
    "Location / supplier readiness": [
      { status: "done", assignee: "paolo", dueInDays: -40, daysAgo: 41 },
    ],
    "Product / service readiness": [
      { status: "done", assignee: "paolo", dueInDays: -33, daysAgo: 34 },
    ],
    "Team readiness": [
      {
        status: "done",
        assignee: { name: "Lea (barista)" },
        dueInDays: -32,
        daysAgo: 33,
      },
    ],
    "Launch readiness": [
      { status: "done", assignee: "paolo", dueInDays: -31, daysAgo: 31 },
    ],
    "Launch day": [
      {
        dueInDays: -28,
        actions: "Open at 2 p.m. with free drinks for pre-registered students",
        daysAgo: 35,
      },
      { status: "done", daysAgo: 28 },
    ],
    // Targets set before the launch review; actuals recorded after the launch.
    Revenue: [
      {
        kpiTarget: "₱168,000 a month",
        kpiReviewFrequency: "Monthly",
        daysAgo: 36,
      },
      { kpiActual: "₱131,400 in the first 4 weeks", daysAgo: 5 },
    ],
    "Orders / Customers per Day": [
      {
        kpiTarget: "40 blocks a day",
        kpiReviewFrequency: "Weekly",
        daysAgo: 36,
      },
      { kpiActual: "33 blocks a day", daysAgo: 5 },
    ],
    "Repeat Rate": [
      {
        kpiTarget: "50% book again within a week",
        kpiReviewFrequency: "Weekly",
        daysAgo: 36,
      },
      { kpiActual: "58%", daysAgo: 5 },
    ],
  },
  execution: [
    {
      type: "next_action",
      title: "Set up the monthly pass for review centres",
      assignee: "paolo",
      dueInDays: 21,
      daysAgo: 7,
    },
  ],
};

/** Plan B: a draft archived before the launch (13 shows "1 archived plan · Show"). */
export const STUDY_CAFE_PLAN_B: PlanSpec = {
  key: "b",
  name: "Plan B",
  creator: "paolo",
  createdDaysAgo: 50,
  editedDaysAgo: 50,
  archived: { daysAgo: 40 },
};
