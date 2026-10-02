import type { ValidationSpec } from "../validation";
import { assume, fact, log, unknown, url } from "./helpers";

interface PiayaOptions {
  key: string;
  ideaId: string;
  workspaceId: string;
  by: "ana" | "kenji";
  price: number;
  createdDaysAgo: number;
}

/**
 * Piaya Gift Box Delivery (design-spec 8.2, 8.3). The numbers are the worked example used to check
 * the calculation: the corporate variant reuses everything and changes only the price.
 */
export function piayaSpec(o: PiayaOptions): ValidationSpec {
  return {
    key: o.key,
    ideaId: o.ideaId,
    workspaceId: o.workspaceId,
    templateVersion: 1,
    by: o.by,
    createdDaysAgo: o.createdDaysAgo,
    answers: [
      assume(
        "V.01.WHO",
        "HR and admin staff of Bacolod offices who buy gifts for clients, and families sending pasalubong to relatives abroad.",
        "m",
      ),
      fact(
        "V.01.WHY_THEM",
        "They gift four to six times a year and already pay ₱350–₱600 a box. Delivery matters more to them than the pastry itself.",
        [log("r1"), log("r3")],
      ),
      fact(
        "V.01.BEHAVIOR",
        "They buy boxed piaya at the airport shop or a mall kiosk, or ask a relative to pick one up.",
        [log("r2")],
      ),
      fact(
        "V.01.PROBLEM",
        "Gift boxes are hard to get delivered on a deadline. Kiosks sell out before holidays and do not deliver.",
        [log("r2"), log("r3")],
      ),
      assume(
        "V.01.FREQUENCY",
        "Peaks at Christmas, MassKara and graduation, with steady weekly orders from offices.",
        "m",
      ),
      assume(
        "V.01.SEVERITY",
        "Missing a client gift deadline is embarrassing for HR teams, so they accept a delivery fee.",
        "l",
      ),
      assume(
        "V.01.PAYMENT",
        "They pay for a presentable box that arrives on time, not for the pastry alone.",
        "m",
      ),
      assume(
        "V.01.SWITCHING",
        "A guaranteed delivery slot and a box that looks good as a gift.",
        "m",
      ),
      assume(
        "V.01.NON_CUSTOMER",
        "Tourists leaving the same day, who buy at the airport, and shoppers who only compare price.",
        "m",
      ),
      fact(
        "V.01.PROOF",
        "Three kiosks and two online sellers already sell boxed piaya, and reviewers ask for delivery.",
        [log("r2"), log("r3"), log("r5")],
      ),
      assume("V.02.CATEGORY", "Boxed local pasalubong with delivery", "h"),
      assume("V.02.OCEAN", "Mixed", "m"),
      assume(
        "V.02.WHY",
        "Many sellers exist (Red), but none offers scheduled delivery of gift-ready boxes (Blue).",
        "m",
      ),
      assume(
        "V.02.DRIVERS",
        "Corporate gifting budgets, OFW families, and food gifting on social media.",
        "m",
      ),
      assume(
        "V.02.BARRIERS",
        "Low barrier to entry, copycats, and bakery supply in peak weeks.",
        "m",
      ),
      fact("V.02.RED_1", "Airport shops, mall kiosks and two Facebook sellers.", [
        log("r1"),
        log("r5"),
      ]),
      assume("V.02.RED_2", "Walk-in traffic and brand recognition.", "m"),
      assume("V.02.RED_3", "High volume at a low margin, mostly from tourists.", "l"),
      assume("V.02.RED_4", "Sellers without a steady supplier close after the peak season.", "l"),
      assume("V.02.BLUE_1", "Scheduled delivery and bulk orders for offices.", "m"),
      assume("V.02.BLUE_2", "Existing sellers rely on walk-in traffic.", "m"),
      fact("V.02.BLUE_3", "Several reviews ask for delivery and say the shop sold out.", [
        log("r3"),
      ]),
      unknown("V.02.MARKET_SIZE", "We have no count of offices that buy gifts every year."),
      assume(
        "V.02.REACHABLE",
        "About 60 offices through BCDX and advisor networks at launch.",
        "m",
      ),
      assume(
        "V.02.SHARE",
        "Break-even is about 180 orders a month, roughly 10 active office accounts.",
        "m",
      ),
      assume(
        "V.04.SURVIVOR_PATTERNS",
        "An established brand, a good location and one reliable bakery.",
        "m",
      ),
      assume(
        "V.04.FAILURE_PATTERNS",
        "Online sellers fail on late delivery and inconsistent packaging.",
        "m",
      ),
      assume(
        "V.08.WORTH",
        "A payback of about nine months is acceptable if the office accounts materialise.",
        "m",
      ),
      assume(
        "V.10.WHY_WORK",
        "Delivery fills a gap and each box leaves more than half the price as margin.",
        "m",
      ),
      assume(
        "V.10.WHY_FAIL",
        "Offices may not switch, and demand may depend on the holidays.",
        "m",
      ),
      assume("V.10.MUST_BE_TRUE", "At least ten offices order every month.", "m"),
      unknown("V.10.BIGGEST_UNKNOWN", "Whether offices reorder outside the holiday season."),
      assume("V.10.BIGGEST_RISK", "Relying on a single bakery for supply.", "m"),
      assume("V.10.BIGGEST_OPPORTUNITY", "Monthly subscription gifting for offices.", "l"),
    ],
    research: [
      {
        id: "r1",
        daysAgo: 42,
        topic: "Boxed piaya price at the airport shop",
        observation: "A ten-piece box is ₱380. Boxes run out on Friday evenings.",
        sourceType: "price_check",
        supports: ["local_price"],
        supportsNote: "Anchor price for gift boxes",
        by: "ana",
      },
      {
        id: "r2",
        daysAgo: 40,
        topic: "Mall kiosk on a Saturday",
        observation:
          "A queue of eight people at noon. Two buyers asked about delivery and were told no.",
        sourceType: "store_observation",
        supports: ["demand_signal"],
        by: "ana",
      },
      {
        id: "r3",
        daysAgo: 38,
        topic: "Reviews asking for delivery",
        observation:
          "Nine of the last 40 reviews of the airport shop mention sold-out boxes or ask for delivery.",
        sourceType: "google_maps_reviews",
        sourceUrl: "https://example.com/maps/bacolod-airport-piaya",
        supports: ["demand_signal"],
        by: "paolo",
      },
      {
        id: "r4",
        daysAgo: 35,
        topic: "Permits for a home-based food business",
        observation:
          "A mayor's permit, a sanitary permit and a barangay clearance are needed. Fees total about ₱8,500.",
        sourceType: "public_data",
        sourceUrl: "https://example.com/city-hall/food-permits",
        supports: ["permits"],
        by: "ana",
      },
      {
        id: "r5",
        daysAgo: 33,
        topic: "Facebook sellers of gift boxes",
        observation:
          "Two sellers charge ₱350 a box, with delivery fees from ₱60 and no delivery slots.",
        sourceType: "social_media",
        supports: ["local_price"],
        by: "kenji",
      },
      {
        id: "r6",
        daysAgo: 30,
        topic: "Bakery wholesale quote",
        observation: "₱120 a box of ten pieces at 250 boxes a month, with gift packaging at ₱45.",
        sourceType: "website",
        sourceUrl: "https://example.com/bakery/wholesale",
        supports: [],
        by: "ana",
      },
      {
        id: "r7",
        daysAgo: 28,
        topic: "Corporate gifting budgets",
        observation:
          "A regional business paper reports that offices raised year-end gift budgets by a tenth.",
        sourceType: "news_report",
        supports: ["demand_signal"],
        by: "paolo",
      },
    ],
    competitors: [
      {
        name: "Airport piaya shop",
        type: "direct",
        targetCustomer: "Departing travellers",
        offering: "Boxed piaya and other pasalubong",
        typicalPrice: 380,
        priceNote: "per box",
        strength: "Location and brand recognition",
        weakness: "No delivery; sells out at peak times",
        whyChosen: "Convenient on the way to the flight",
        whySurvive: "Steady tourist traffic",
      },
      {
        name: "Mall kiosk gift boxes",
        type: "direct",
        targetCustomer: "Mall shoppers and office staff",
        offering: "Gift boxes of local sweets",
        typicalPrice: 420,
        priceNote: "per box",
        strength: "Presentable boxes",
        weakness: "No delivery; limited stock",
        whyChosen: "Easy to compare and buy in person",
        whySurvive: "High foot traffic",
      },
      {
        name: "Facebook pasalubong sellers",
        type: "indirect",
        targetCustomer: "Friends and relatives of the seller",
        offering: "Gift boxes ordered by message",
        typicalPrice: 350,
        priceNote: "per box, delivery extra",
        strength: "Low price",
        weakness: "Slow replies; inconsistent packaging",
        whyChosen: "Cheapest option",
        whySurvive: "No rent",
      },
      {
        name: "Relative pickup",
        type: "substitute",
        targetCustomer: "Families sending gifts abroad",
        offering: "A relative buys and ships the box",
        typicalPrice: null,
        strength: "Free",
        weakness: "Depends on the relative's time",
        whyChosen: "Personal touch",
        whySurvive: "Always available",
      },
    ],
    costs: {
      "initial.equipment": {
        amount: 35000,
        fau: "assumption",
        confidence: "medium",
        whyNeeded: "Sealer, shelves and insulated delivery bags",
        canReduce: "partly",
      },
      "initial.renovation": {
        amount: 20000,
        fau: "assumption",
        confidence: "medium",
        whyNeeded: "Packing counter in the rented space",
        canReduce: "yes",
      },
      "initial.lease_deposit": {
        amount: 24000,
        fau: "fact",
        evidence: [
          url("https://example.com/listings/bacolod-stall", "Listing: two months deposit"),
        ],
        whyNeeded: "Two months of rent as deposit",
        canReduce: "no",
      },
      "initial.permits": {
        amount: 8500,
        fau: "fact",
        evidence: [log("r4")],
        whyNeeded: "Mayor's, sanitary and barangay permits",
        canReduce: "no",
      },
      "initial.inventory": {
        amount: 15000,
        fau: "assumption",
        confidence: "medium",
        whyNeeded: "First month of boxes and ribbons",
        canReduce: "partly",
      },
      "initial.branding": {
        amount: 12000,
        fau: "assumption",
        confidence: "low",
        whyNeeded: "Logo, box sleeve design and stamp",
        canReduce: "yes",
      },
      "initial.launch_marketing": {
        amount: 10000,
        fau: "assumption",
        confidence: "medium",
        whyNeeded: "Office samples and social ads",
        canReduce: "partly",
      },
      "initial.tech_setup": {
        amount: 5000,
        fau: "assumption",
        confidence: "high",
        whyNeeded: "Order form and slot booking",
        canReduce: "yes",
      },
      "initial.working_capital": {
        amount: 40000,
        fau: "assumption",
        confidence: "medium",
        whyNeeded: "Cover the first two months of payroll and stock",
        canReduce: "no",
      },
      "initial.other": { amount: 0, fau: "assumption", confidence: "low", canReduce: "yes" },
      "monthly.rent": {
        amount: 12000,
        fau: "fact",
        evidence: [url("https://example.com/listings/bacolod-stall", "Listing: ₱12,000 a month")],
      },
      "monthly.salaries": { amount: 18000, fau: "assumption", confidence: "medium" },
      "monthly.utilities": { amount: 3500, fau: "assumption", confidence: "medium" },
      "monthly.internet": {
        amount: 1200,
        fau: "fact",
        evidence: [url("https://example.com/isp/plans", "Business plan price")],
      },
      "monthly.accounting": { amount: 2000, fau: "assumption", confidence: "high" },
      "monthly.marketing": { amount: 5000, fau: "assumption", confidence: "medium" },
      "monthly.insurance": { amount: 0, fau: "assumption", confidence: "low" },
      "monthly.other": { amount: 0, fau: "assumption", confidence: "low" },
      "variable.materials": { amount: 120, fau: "fact", evidence: [log("r6")] },
      "variable.packaging": { amount: 45, fau: "fact", evidence: [log("r6")] },
      "variable.payment_fee": {
        percent: 0.03,
        fau: "fact",
        evidence: [url("https://example.com/payments/fees", "Wallet fee schedule")],
      },
      "variable.delivery": { amount: 40, fau: "assumption", confidence: "medium" },
      "variable.labor": { amount: 0, fau: "assumption", confidence: "low" },
      "variable.other": { amount: 0, fau: "assumption", confidence: "low" },
    },
    econ: {
      selling_price: { value: o.price, fau: "assumption", confidence: "medium" },
      operating_days: { value: 26, fau: "assumption", confidence: "high" },
      units_conservative: { value: 6, fau: "assumption", confidence: "low" },
      units_expected: { value: 10, fau: "assumption", confidence: "medium" },
      units_strong: { value: 15, fau: "assumption", confidence: "low" },
      units_capacity: { value: 25, fau: "assumption", confidence: "medium" },
    },
    assumptions: [
      {
        statement: "At least ten offices order every month.",
        whyBelieve: "HR contacts told us they gift four to six times a year.",
        evidenceNote: "Three informal interviews",
        confidence: "medium",
        disproveCondition: "Fewer than five offices reorder within two months.",
        nextCheck: "Run a pilot with five offices.",
      },
      {
        statement: "The bakery can supply 260 boxes a month at ₱120.",
        whyBelieve: "Their written quote covers 250 boxes a month.",
        evidenceNote: "Wholesale quote",
        confidence: "medium",
        disproveCondition: "The bakery refuses a peak-season commitment.",
        nextCheck: "Ask for a written supply agreement.",
      },
      {
        statement: "Customers accept a higher price than the airport shop for delivery.",
        whyBelieve: "Reviewers ask for delivery and already pay ₱350–₱420.",
        evidenceNote: "Price checks and reviews",
        confidence: "medium",
        disproveCondition: "Pilot offices choose the cheaper seller after the first order.",
        nextCheck: "Offer two price points to pilot offices.",
      },
    ],
    risks: [
      {
        statement: "A single bakery supplies all boxes.",
        probability: "medium",
        impact: "high",
        whyMatters: "A supply failure stops every order.",
        mitigation: "Qualify a second bakery before launch.",
        howToValidate: "Taste-test and quote from two more bakeries.",
      },
      {
        statement: "Demand is concentrated in the holiday season.",
        probability: "high",
        impact: "medium",
        whyMatters: "Fixed costs continue in slow months.",
        mitigation: "Sell monthly subscriptions to offices.",
        howToValidate: "Track orders per month during the pilot.",
      },
      {
        statement: "Late deliveries damage trust with offices.",
        probability: "medium",
        impact: "medium",
        whyMatters: "Reliable delivery is the reason to switch.",
        mitigation: "Use fixed delivery slots and a buffer rider.",
        howToValidate: "Measure on-time rate in the pilot.",
      },
    ],
  };
}
