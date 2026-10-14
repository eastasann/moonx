import type { IdeaSpec } from "../ideas";

/** One save of an answer the AI import of Kenji's reply has just changed. */
const aiImport = {
  daysAgo: 0,
  hoursAgo: 2,
  by: "kenji",
  source: "ai_import",
  batch: "health-bowl/ai-import",
} as const;

/**
 * Bacolod Health Bowl (design-spec 8.2): close to the original's worked example. Startup
 * costs with 3 Unknown rows and 1 empty row (check 3 partial), materials at 35% of the
 * price, permits not started, 3 answers left Unclassified by an AI import a moment ago,
 * and a Fact whose only research log was deleted.
 */
export const HEALTH_BOWL: IdeaSpec = {
  key: "health-bowl",
  name: "Bacolod Health Bowl",
  oneLineConcept:
    "Healthy rice bowls for office lunches in Bacolod, ordered ahead and delivered at noon.",
  proposedSolution:
    "Five rotating bowls (brown rice, grilled chicken or fish, vegetables) at ₱220, ordered by 10 a.m. on Messenger and delivered at noon to offices near the kitchen.",
  proposer: "kenji",
  createdDaysAgo: 35,
  template: "v1",
  workedDaysAgo: 24,
  researchLogs: [
    {
      key: "bowl-prices",
      daysAgo: 30,
      topic: "Prices of salad and bowl places downtown",
      observation:
        "Four places sell bowls for ₱180–₱280; most are in malls and none deliver before noon.",
      sourceType: "price_check",
      supports: ["local_price"],
      supportsNote: "Local price range for a healthy lunch",
      by: "kenji",
    },
    {
      key: "clinic-report",
      daysAgo: 29,
      topic: "Company clinic summary on office workers' health",
      observation:
        "Draft summary shared by a company nurse; not cleared for use outside the company.",
      sourceType: "other",
      by: "kenji",
      deleted: { daysAgo: 5, by: "kenji" },
    },
    {
      key: "office-survey",
      daysAgo: 28,
      topic: "Lunch survey at two office buildings",
      observation:
        "38 of 60 respondents would order a healthy lunch at ₱200–₱250 twice a week.",
      sourceType: "other",
      supports: ["demand_signal"],
      supportsNote: "Demand at our price",
      by: "kenji",
    },
    {
      key: "fb-comments",
      daysAgo: 27,
      topic: "Comments on a healthy lunch post",
      observation:
        "120 comments on a local food page asking for delivery to offices on Lacson St. and Araneta St.",
      sourceType: "social_media",
      supports: ["demand_signal"],
      supportsNote: "Problem signal: no delivered healthy lunch",
      by: "paolo",
    },
    {
      key: "supplier-visit",
      daysAgo: 26,
      topic: "Visit to Libertad market suppliers",
      observation:
        "Chicken breast ₱240 a kilo, vegetables in season ₱60–₱90 a kilo; two suppliers deliver every morning.",
      sourceType: "store_observation",
      supportsNote: "Ingredient cost",
      by: "kenji",
    },
    {
      key: "foot-traffic",
      daysAgo: 25,
      topic: "Lunch-hour foot traffic on Lacson St.",
      observation:
        "About 400 office workers pass the corner between 11:30 and 12:30.",
      sourceType: "store_observation",
      by: "kenji",
    },
  ],
  competitors: [
    {
      name: "Mall salad bars",
      type: "direct",
      targetCustomer: "Office workers who can leave for lunch",
      offering: "Build-your-own salads and grain bowls",
      typicalPrice: 250,
      priceNote: "per bowl",
      strength: "Fresh, visible, trusted",
      weakness: "Inside the mall; no delivery before noon",
      evidence: [{ log: "bowl-prices" }],
    },
    {
      name: "Carinderia lunches",
      type: "substitute",
      targetCustomer: "Everyone on a budget",
      offering: "Rice with one or two viands",
      typicalPrice: 90,
      priceNote: "per meal",
      strength: "Cheap and everywhere",
      weakness: "Oily and salty",
    },
    {
      name: "Home-cooked baon",
      type: "substitute",
      targetCustomer: "Workers saving money",
      offering: "Food brought from home",
      strength: "Cheapest and familiar",
      weakness: "Takes time every morning",
    },
    {
      name: "Food delivery apps",
      type: "indirect",
      targetCustomer: "Office workers ordering in",
      offering: "Fast food and restaurant meals",
      strength: "Wide choice",
      weakness: "Few healthy options; delivery fees add ₱50",
    },
  ],
  assumptions: [
    {
      statement: "Workers who try the bowls will order twice a week.",
      whyBelieve: "The survey said so.",
      confidence: "low",
      disproveCondition: "Fewer than 30% of first-week customers order again.",
      nextCheck: "One-week trial with one office building.",
      evidence: [{ log: "office-survey" }],
    },
    {
      statement: "Ingredients cost about 35% of the price.",
      whyBelieve: "Market prices from the supplier visit.",
      confidence: "medium",
      disproveCondition: "Recipe costing comes out above 40%.",
      nextCheck: "Cost each of the five recipes.",
      evidence: [{ log: "supplier-visit" }],
    },
  ],
  risks: [
    {
      statement: "Lunch demand drops on rainy days.",
      probability: "high",
      impact: "medium",
      mitigation: "Take orders by 10 a.m. and cook to order.",
    },
    {
      statement: "Ingredient prices rise in the typhoon season.",
      probability: "medium",
      impact: "high",
      mitigation: "Rotate the menu to what is in season.",
    },
  ],
  costs: {
    "initial.equipment": {
      amount: 60000,
      fau: "assumption",
      confidence: "medium",
      whyNeeded: "Rice cookers, grill, chiller",
    },
    "initial.renovation": {
      fau: "unknown",
      notes: "Depends on the space we find",
    },
    "initial.lease_deposit": {
      amount: 30000,
      fau: "assumption",
      confidence: "high",
    },
    "initial.permits": {
      fau: "unknown",
      notes: "Not asked at city hall yet",
    },
    "initial.inventory": {
      amount: 12000,
      fau: "assumption",
      confidence: "medium",
    },
    "initial.branding": { fau: "unknown" },
    "initial.launch_marketing": {
      amount: 8000,
      fau: "assumption",
      confidence: "medium",
    },
    "initial.tech_setup": {
      amount: 4000,
      fau: "assumption",
      confidence: "high",
    },
    // initial.working_capital is the one row left empty.
    "initial.other": { amount: 0, fau: "assumption", confidence: "high" },
    "monthly.rent": { amount: 15000, fau: "assumption", confidence: "high" },
    "monthly.salaries": {
      amount: 24000,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.utilities": {
      amount: 4000,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.internet": { amount: 1000, fau: "assumption", confidence: "high" },
    "monthly.accounting": {
      amount: 1500,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.marketing": {
      amount: 3000,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.insurance": { amount: 0, fau: "assumption", confidence: "medium" },
    "monthly.other": { amount: 0, fau: "assumption", confidence: "high" },
    "variable.materials": {
      percent: 0.35,
      fau: "assumption",
      confidence: "medium",
    },
    "variable.packaging": {
      amount: 12,
      fau: "assumption",
      confidence: "high",
    },
    "variable.payment_fee": {
      percent: 0.02,
      fau: "assumption",
      confidence: "high",
    },
    "variable.delivery": {
      amount: 15,
      fau: "assumption",
      confidence: "medium",
    },
    "variable.labor": { amount: 0, fau: "assumption", confidence: "high" },
    "variable.other": { amount: 0, fau: "assumption", confidence: "high" },
  },
  economics: {
    selling_price: {
      value: 220,
      fau: "fact",
      evidence: [{ log: "bowl-prices" }],
    },
    operating_days: { value: 22, fau: "assumption", confidence: "high" },
    units_conservative: { value: 25, fau: "assumption", confidence: "low" },
    units_expected: { value: 40, fau: "assumption", confidence: "low" },
    units_strong: { value: 60, fau: "assumption", confidence: "low" },
    units_capacity: { value: 80, fau: "assumption", confidence: "medium" },
  },
  answers: {
    "V.01.WHO": {
      text: "Office workers aged 25–40 on Lacson St. and Araneta St. who want a healthier lunch than carinderia food.",
      fau: "fact",
      evidence: [{ log: "office-survey" }],
      earlier: [
        {
          text: "Office workers.",
          fau: null,
          confidence: null,
          daysAgo: 34,
          by: "kenji",
        },
      ],
    },
    "V.01.WHY_THEM": {
      text: "They eat out every weekday and can spend ₱200 or more on lunch.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.01.BEHAVIOR": {
      text: "They eat at carinderias or mall food courts, or bring baon from home three days a week.",
      edit: aiImport,
      earlier: [
        {
          text: "Carinderia or food court.",
          fau: "assumption",
          confidence: "medium",
          daysAgo: 24,
          by: "kenji",
        },
      ],
    },
    "V.01.PROBLEM": {
      text: "Healthy lunches near offices are expensive or far away, so most workers eat oily, salty food every day.",
      fau: "fact",
      evidence: [{ log: "clinic-report" }],
    },
    "V.01.FREQUENCY": {
      text: "Every working day.",
      fau: "assumption",
      confidence: "high",
    },
    "V.01.SEVERITY": {
      text: "Moderate: workers worry about weight and blood pressure but rarely change habits.",
      fau: "assumption",
      confidence: "low",
    },
    "V.01.PAYMENT": {
      text: "A healthy meal at noon without leaving the office.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.01.SWITCHING": {
      text: "A price close to ₱200, delivery at noon sharp, and a menu that changes daily.",
      edit: aiImport,
      earlier: [
        {
          text: "Price and delivery.",
          fau: "assumption",
          confidence: "low",
          daysAgo: 24,
          by: "kenji",
        },
      ],
    },
    "V.01.NON_CUSTOMER": {
      text: "Workers who bring baon every day to save money.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.01.PROOF": {
      text: "38 of 60 surveyed workers would order twice a week; 120 comments asking for delivery.",
      fau: "fact",
      evidence: [{ log: "office-survey" }, { log: "fb-comments" }],
    },
    "V.02.CATEGORY": {
      text: "Healthy lunch delivery",
      fau: "assumption",
      confidence: "high",
    },
    "V.02.OCEAN": { text: "Red", fau: "assumption", confidence: "high" },
    "V.02.WHY": {
      text: "Many places sell lunch near offices; we compete on health and delivery.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.DRIVERS": {
      text: "More health awareness since the pandemic, and more offices opening in the city centre.",
      edit: aiImport,
      earlier: [
        {
          text: "Health trend.",
          fau: "assumption",
          confidence: "low",
          daysAgo: 23,
          by: "kenji",
        },
      ],
    },
    "V.02.RED_1": {
      text: "Two mall salad bars and dozens of carinderias.",
      fau: "fact",
      evidence: [{ log: "bowl-prices" }],
    },
    "V.02.RED_2": {
      text: "Malls bring foot traffic; carinderias are cheap.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.MARKET_SIZE": {
      text: "About 15,000 office workers in the downtown area.",
      fau: "assumption",
      confidence: "low",
    },
    "V.02.REACHABLE": {
      text: "About 1,000 workers within 2 km of the kitchen.",
      fau: "assumption",
      confidence: "low",
    },
    "V.10.WHY_WORK": {
      text: "Strong interest in the survey, and no delivered healthy lunch near the offices.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.10.BIGGEST_UNKNOWN": {
      text: "Whether workers keep ordering after the first week.",
      fau: "unknown",
    },
  },
};
