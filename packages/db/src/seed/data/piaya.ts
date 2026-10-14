import type { IdeaSpec } from "../ideas";
import type { PlanSpec } from "../plans";

/**
 * Piaya Gift Box Delivery (design-spec 8.2): all six checks done, and the numbers of 8.3
 * that the calculation is checked against.
 */
export const PIAYA: IdeaSpec = {
  key: "piaya",
  name: "Piaya Gift Box Delivery",
  oneLineConcept:
    "Boxed piaya gift sets delivered to Bacolod offices for client visits and staff celebrations.",
  proposedSolution:
    "A box of 12 piaya in four flavours (muscovado, ube, mango, cheese) with a printed card, ordered by Messenger or a web form and delivered the same morning within Bacolod.",
  proposer: "ana",
  createdDaysAgo: 45,
  template: "v1",
  workedDaysAgo: 31,
  researchLogs: [
    {
      key: "shop-prices",
      daysAgo: 42,
      topic: "Piaya gift box prices on Lacson St.",
      observation:
        "Five pasalubong shops sell boxes of 10–12 piaya for ₱180–₱350. None deliver to offices; two take phone orders for pickup.",
      sourceType: "price_check",
      supports: ["local_price"],
      supportsNote: "Local price range for boxed piaya",
      by: "ana",
    },
    {
      key: "office-walk",
      daysAgo: 40,
      topic: "Offices along Lacson St. and BS Aquino Drive",
      observation:
        "Counted 14 offices with 20 or more staff (banks, BPOs, insurance) within 3 km of the kitchen. Receptionists at 6 of them buy gifts for client visits every month.",
      sourceType: "store_observation",
      supports: ["demand_signal"],
      supportsNote: "Corporate buyers close to the kitchen",
      by: "kenji",
    },
    {
      key: "hr-interviews",
      daysAgo: 38,
      topic: "Interviews with HR officers at three BPOs",
      observation:
        "All three buy food gifts for anniversaries and visiting clients; two spend ₱500–₱800 per gift. They need an invoice and delivery before 10 a.m.",
      sourceType: "other",
      supports: ["demand_signal"],
      supportsNote:
        "Willingness to pay ₱450 or more, and the invoice requirement",
      by: "ana",
    },
    {
      key: "city-permits",
      daysAgo: 37,
      topic: "Bacolod permits for a food business",
      observation:
        "Mayor's permit, sanitary permit, BIR registration and barangay clearance. About ₱8,500 in fees for a small commissary.",
      sourceType: "public_data",
      sourceUrl: "https://bacolodcity.gov.ph/business-permits",
      supports: ["permits"],
      supportsNote: "Permit list and fees",
      by: "paolo",
    },
    {
      key: "kitchen-lease",
      daysAgo: 35,
      topic: "Commissary kitchen lease quote",
      observation:
        "Ana's aunt offers her commissary kitchen at ₱12,000 a month with two months' advance; shared with her catering on weekends.",
      sourceType: "other",
      supportsNote: "Rent and lease deposit",
      by: "ana",
    },
    {
      key: "courier-rates",
      daysAgo: 34,
      topic: "Courier rates within Bacolod",
      observation:
        "Motorbike couriers charge ₱35–₱50 per drop within 5 km. A monthly account averages ₱40.",
      sourceType: "website",
      sourceUrl: "https://www.lalamove.com/en-ph/bacolod",
      supportsNote: "Delivery cost per box",
      by: "paolo",
    },
    {
      key: "fb-group",
      daysAgo: 32,
      topic: "Posts asking for corporate gift suppliers",
      observation:
        "In the Bacolod Business Owners group, 9 posts in 3 months asked for local gift suppliers for clients.",
      sourceType: "social_media",
      supports: ["demand_signal"],
      supportsNote: "Recurring demand for local corporate gifts",
      by: "kenji",
    },
  ],
  competitors: [
    {
      name: "Pasalubong shops on Lacson St.",
      type: "direct",
      targetCustomer: "Tourists and locals buying pasalubong",
      offering: "Boxes of 10–12 plain piaya",
      typicalPrice: 350,
      priceNote: "per box of 12",
      strength: "Known brands and visible shops",
      weakness: "No delivery, plain packaging, no invoice",
      whyChosen: "Trusted names, on the way home",
      whySurvive: "Steady tourist traffic and low costs",
      evidence: [{ log: "shop-prices" }],
    },
    {
      name: "Bakeshop corporate trays",
      type: "indirect",
      targetCustomer: "Offices ordering snacks for meetings",
      offering: "Trays of assorted pastries, delivered",
      typicalPrice: 600,
      priceNote: "per tray",
      strength: "Already deliver to offices every week",
      weakness: "Generic snacks, not a gift",
      whyChosen: "One call covers the meeting",
      whySurvive: "Weekly repeat orders",
    },
    {
      name: "Online gift basket sellers",
      type: "direct",
      targetCustomer: "Companies sending holiday gifts",
      offering: "Baskets of wine, chocolates and local snacks",
      typicalPrice: 1200,
      priceNote: "per basket",
      strength: "Premium look, invoices, bulk orders",
      weakness: "Expensive, seasonal, 2–3 days' lead time",
      whyChosen: "Impressive for big clients",
      whySurvive: "High margins in November and December",
    },
    {
      name: "Buying piaya at the market and wrapping it",
      type: "substitute",
      targetCustomer: "Staff told to bring a gift",
      offering: "A do-it-yourself gift",
      strength: "Cheapest option",
      weakness: "Takes a staff member's lunch hour and looks improvised",
      whyChosen: "No budget approval needed",
      whySurvive: "Always available",
    },
  ],
  assumptions: [
    {
      statement: "Offices will reorder at least once a month.",
      whyBelieve: "HR officers buy gifts for client visits every month.",
      evidenceNote: "Two of the three HR officers said monthly.",
      confidence: "medium",
      disproveCondition: "Fewer than 3 repeat orders in the first 2 months.",
      nextCheck: "Pilot with five offices for four weeks.",
      evidence: [{ log: "hr-interviews" }],
    },
    {
      statement: "Offices will pay ₱450 for a delivered box.",
      whyBelieve: "HR budgets are ₱500–₱800 per gift.",
      confidence: "high",
      disproveCondition:
        "More than half of the quotes are turned down on price.",
      nextCheck: "Send quotes to 10 offices.",
      evidence: [{ log: "hr-interviews" }, { log: "shop-prices" }],
    },
    {
      statement: "The kitchen can make 25 boxes a day with two bakers.",
      whyBelieve: "The aunt's kitchen made 30 boxes for a wedding last year.",
      confidence: "medium",
      disproveCondition: "A trial day yields fewer than 20 boxes.",
      nextCheck: "Run a full production trial.",
    },
  ],
  risks: [
    {
      statement: "Piaya goes stale before the gift is given.",
      probability: "medium",
      impact: "high",
      whyMatters: "A stale gift reflects badly on our customer.",
      mitigation:
        "Bake the same morning, print a best-before date and seal each box.",
      howToValidate: "Three-day shelf test.",
    },
    {
      statement: "Corporate demand is seasonal.",
      probability: "high",
      impact: "medium",
      whyMatters: "Fixed costs continue in slow months.",
      mitigation:
        "Add anniversary and onboarding gifts; sell to tourists on weekends.",
      howToValidate: "Track orders by month during the pilot.",
    },
    {
      statement: "A pasalubong brand starts delivering to offices.",
      probability: "medium",
      impact: "medium",
      whyMatters: "They have the brand recognition we lack.",
      mitigation: "Lock in monthly accounts with invoices and custom cards.",
      howToValidate: "Check competitor pages every month.",
    },
    {
      statement: "Courier delays miss the morning deliveries.",
      probability: "low",
      impact: "medium",
      whyMatters: "Offices need the gift before the client arrives.",
      mitigation: "Deliver orders due before 10 a.m. ourselves.",
      howToValidate: "Track the on-time rate in the pilot.",
    },
  ],
  // design-spec 8.3
  costs: {
    "initial.equipment": {
      amount: 35000,
      fau: "assumption",
      confidence: "high",
      whyNeeded: "A second oven, two mixers and a sealing machine",
      canReduce: "partly",
    },
    "initial.renovation": {
      amount: 20000,
      fau: "assumption",
      confidence: "medium",
      whyNeeded: "Shelving and a packing station",
      canReduce: "partly",
    },
    "initial.lease_deposit": {
      amount: 24000,
      fau: "fact",
      evidence: [{ log: "kitchen-lease" }],
      whyNeeded: "Two months' advance on the kitchen",
      canReduce: "no",
    },
    "initial.permits": {
      amount: 8500,
      fau: "fact",
      evidence: [{ log: "city-permits" }],
      whyNeeded: "Mayor's, sanitary, BIR and barangay permits",
      canReduce: "no",
    },
    "initial.inventory": {
      amount: 15000,
      fau: "assumption",
      confidence: "medium",
      whyNeeded: "Flour, muscovado, ube and boxes for the first two weeks",
      canReduce: "partly",
    },
    "initial.branding": {
      amount: 12000,
      fau: "assumption",
      confidence: "high",
      whyNeeded: "Logo, box print and cards",
      canReduce: "yes",
    },
    "initial.launch_marketing": {
      amount: 10000,
      fau: "assumption",
      confidence: "medium",
      whyNeeded: "Sample boxes for 20 offices",
      canReduce: "yes",
    },
    "initial.tech_setup": {
      amount: 5000,
      fau: "assumption",
      confidence: "high",
      whyNeeded: "Order form and invoicing software",
      canReduce: "partly",
    },
    "initial.working_capital": {
      amount: 40000,
      fau: "assumption",
      confidence: "medium",
      whyNeeded: "Covers salaries and rent while invoices are unpaid",
      canReduce: "no",
    },
    "initial.other": { amount: 0, fau: "assumption", confidence: "high" },
    "monthly.rent": {
      amount: 12000,
      fau: "fact",
      evidence: [{ log: "kitchen-lease" }],
    },
    "monthly.salaries": {
      amount: 18000,
      fau: "assumption",
      confidence: "high",
      notes: "One baker full time; Ana unpaid until break-even",
    },
    "monthly.utilities": {
      amount: 3500,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.internet": { amount: 1200, fau: "assumption", confidence: "high" },
    "monthly.accounting": {
      amount: 2000,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.marketing": {
      amount: 5000,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.insurance": {
      amount: 0,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.other": { amount: 0, fau: "assumption", confidence: "high" },
    "variable.materials": {
      amount: 120,
      fau: "assumption",
      confidence: "medium",
    },
    "variable.packaging": {
      amount: 45,
      fau: "assumption",
      confidence: "high",
    },
    "variable.payment_fee": {
      percent: 0.03,
      fau: "fact",
      evidence: [
        {
          url: "https://www.paymongo.com/pricing",
          note: "Card and e-wallet fees",
        },
      ],
    },
    "variable.delivery": {
      amount: 40,
      fau: "fact",
      evidence: [{ log: "courier-rates" }],
    },
    "variable.labor": { amount: 0, fau: "assumption", confidence: "high" },
    "variable.other": { amount: 0, fau: "assumption", confidence: "high" },
  },
  // design-spec 8.3. The target margin is left empty, so the default 15% applies.
  economics: {
    selling_price: {
      value: 450,
      fau: "assumption",
      confidence: "high",
      earlier: [{ value: 400, daysAgo: 41, by: "ana" }],
    },
    operating_days: { value: 26, fau: "assumption", confidence: "high" },
    units_conservative: { value: 6, fau: "assumption", confidence: "low" },
    units_expected: { value: 10, fau: "assumption", confidence: "medium" },
    units_strong: { value: 15, fau: "assumption", confidence: "low" },
    units_capacity: { value: 25, fau: "assumption", confidence: "medium" },
  },
  answers: {
    "V.01.WHO": {
      text: "HR and admin officers at Bacolod offices with 20 or more staff (banks, BPOs, insurance) who buy gifts for client visits and staff milestones.",
      fau: "fact",
      evidence: [{ log: "office-walk" }, { log: "hr-interviews" }],
      earlier: [
        {
          text: "Office workers in Bacolod.",
          fau: null,
          confidence: null,
          daysAgo: 44,
          by: "ana",
          client: "web_mobile",
        },
      ],
    },
    "V.01.WHY_THEM": {
      text: "They buy every month, pay by invoice and care more about reliability than price.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.01.BEHAVIOR": {
      text: "They send a staff member to a pasalubong shop at lunch, or order a generic tray from a bakeshop.",
      fau: "fact",
      evidence: [{ log: "office-walk" }],
    },
    "V.01.PROBLEM": {
      text: "Getting a local, presentable gift to the office on time takes staff time and often looks improvised.",
      fau: "fact",
      evidence: [{ log: "hr-interviews" }],
      edit: {
        daysAgo: 36,
        hoursAgo: 1,
        by: "ana",
        source: "revert",
        revertTo: 0,
      },
      earlier: [
        { daysAgo: 37, by: "ana" },
        {
          text: "Corporate gifting in Bacolod is time-consuming and inconsistent, and offices lack a reliable local supplier.",
          fau: null,
          confidence: null,
          daysAgo: 36,
          hoursAgo: 3,
          by: "ana",
          source: "ai_import",
          batch: "piaya/ai-import",
        },
      ],
    },
    "V.01.FREQUENCY": {
      text: "Most offices give 2–4 gifts a month: client visits, birthdays and anniversaries.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.01.SEVERITY": {
      text: "Low cost but high embarrassment: a late or shabby gift reflects on the company.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.01.PAYMENT": {
      text: "It saves a staff member's lunch hour, and the gift arrives with an invoice and a printed card.",
      fau: "assumption",
      confidence: "high",
    },
    "V.01.SWITCHING": {
      text: "Same-day delivery before 10 a.m., consistent packaging and monthly invoicing.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.01.NON_CUSTOMER": {
      text: "Tourists buying pasalubong for themselves, and households buying for family.",
      fau: "assumption",
      confidence: "high",
    },
    "V.01.PROOF": {
      text: "14 large offices nearby, HR officers who buy every month, and 9 posts in 3 months asking for local gift suppliers.",
      fau: "fact",
      evidence: [
        { log: "office-walk" },
        { log: "hr-interviews" },
        { log: "fb-group" },
      ],
    },
    "V.02.CATEGORY": {
      text: "Corporate food gifts",
      fau: "assumption",
      confidence: "high",
    },
    "V.02.OCEAN": { text: "Mixed", fau: "assumption", confidence: "high" },
    "V.02.WHY": {
      text: "Piaya itself is a crowded market, but nobody in Bacolod delivers piaya gift boxes to offices.",
      fau: "fact",
      evidence: [{ log: "shop-prices" }],
    },
    "V.02.DRIVERS": {
      text: "More BPO offices opening in Bacolod, and companies spending more on staff engagement.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.BARRIERS": {
      text: "Food permits, a short shelf life and well-known pasalubong brands.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.RED_1": {
      text: "Three long-running pasalubong shops on Lacson St.",
      fau: "fact",
      evidence: [{ log: "shop-prices" }],
    },
    "V.02.RED_2": {
      text: "Prime locations, tourist traffic and family recipes people recognise.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.RED_3": {
      text: "High volume at low margins, sold over the counter.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.RED_4": {
      text: "New shops fail when they cannot get a visible location.",
      fau: "assumption",
      confidence: "low",
    },
    "V.02.BLUE_1": {
      text: "Presentable gifts delivered to offices, with invoices.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.BLUE_2": {
      text: "Shops serve walk-in tourists and never built delivery or invoicing.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.BLUE_3": {
      text: "HR officers already spend ₱500–₱800 per gift and ask for local suppliers.",
      fau: "fact",
      evidence: [{ log: "hr-interviews" }, { log: "fb-group" }],
    },
    "V.02.MARKET_SIZE": {
      text: "We do not know how many companies in Bacolod buy client gifts.",
      fau: "unknown",
    },
    "V.02.REACHABLE": {
      text: "About 40 offices within 5 km of the kitchen in the first six months.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.02.SHARE": {
      text: "About 181 boxes a month, or 7 a day: roughly 15 office accounts ordering 12 boxes a month.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.04.SURVIVOR_PATTERNS": {
      text: "Survivors own a location people pass every day, keep the recipe consistent and sell in volume.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.04.FAILURE_PATTERNS": {
      text: "Shops that copied the product without a location or a niche closed within two years.",
      fau: "assumption",
      confidence: "low",
    },
    "V.08.WORTH": {
      text: "Yes, if the expected case holds: the ₱169,500 is back in about 9 months, and the business pays Ana's target income within a year.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.10.WHY_WORK": {
      text: "Offices already buy gifts every month, nobody delivers piaya to them, and the kitchen is available.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.10.WHY_FAIL": {
      text: "Demand may be seasonal, and the shops could start delivering quickly.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.10.MUST_BE_TRUE": {
      text: "At least 15 offices order every month at ₱450 a box.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.10.BIGGEST_UNKNOWN": {
      text: "How many companies outside our walking area buy client gifts.",
      fau: "unknown",
    },
    "V.10.BIGGEST_RISK": {
      text: "A stale box damaging a customer's client relationship.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.10.BIGGEST_OPPORTUNITY": {
      text: "Monthly gift subscriptions for BPO offices.",
      fau: "assumption",
      confidence: "low",
    },
  },
};

/**
 * Plan A: version "v1 For advisors" saved and changed since (+ changes), Go / No-Go
 * Delay, every kind of execution item with one overdue and one due in 2 days, and every
 * source of both Pitch Decks written (design-spec 6.14).
 */
export const PIAYA_PLAN_A: PlanSpec = {
  key: "a",
  name: "Plan A",
  businessName: "Piaya Gift Box Co.",
  creator: "ana",
  createdDaysAgo: 27,
  editedDaysAgo: 14,
  version: { name: "v1 For advisors", savedDaysAgo: 10, by: "ana" },
  answers: {
    "P.01.5": {
      text: "We sell boxes of 12 piaya at ₱450, delivered, invoiced monthly to office accounts.",
    },
    "P.01.6": {
      text: "Offices already buy gifts every month and nobody delivers piaya to them; the pilot with five offices will show whether they reorder.",
      edit: { daysAgo: 3, by: "ana" },
      earlier: [
        {
          text: "Offices already buy gifts every month and nobody delivers piaya to them.",
          daysAgo: 20,
          by: "ana",
        },
      ],
    },
    "P.02.1": {
      text: "To make Bacolod's own sweet the easy, proud choice for every office gift.",
    },
    "P.02.2": {
      text: "30 office accounts, a kitchen team of 5 and a second product line for weddings.",
    },
    "P.02.3": {
      text: "The go-to corporate gift supplier in Negros Occidental, shipping to Iloilo as well.",
    },
    "P.02.4": {
      text: "A tourist pasalubong shop or a mass-market bakery.",
    },
    "P.03.2": {
      text: "Schools and clinics that thank partners and staff a few times a year.",
    },
    "P.03.4": {
      text: "A client visit, a staff anniversary or a partner's event on the calendar.",
    },
    "P.04.5": {
      text: "Shops do not deliver or invoice, and trays are snacks, not gifts.",
    },
    "P.05.2": {
      text: "Custom flavours, gift baskets and shipping outside Bacolod.",
    },
    "P.05.3": {
      text: "Order by 4 p.m., the box arrives before 10 a.m. the next day with the card already written.",
    },
    "P.05.4": {
      text: "Baked the same morning, sealed, every box checked against a photo standard.",
    },
    "P.05.5": {
      text: "Wedding favours, holiday bundles and a monthly gift subscription.",
    },
    "P.06.5": {
      text: "Pasalubong shops, bakeshop trays, online gift baskets, and staff buying at the market.",
    },
    "P.06.7": {
      text: "Deliver on time with an invoice, and make the box look like a gift, not a snack.",
    },
    "P.06.8": {
      text: "Shops built for walk-in tourists; delivery and invoicing were never their business.",
    },
    "P.07.1": {
      text: "For HR officers in Bacolod, who need a local gift on short notice, our business is a piaya gift service that delivers before 10 a.m. Unlike pasalubong shops, we deliver, invoice and write the card.",
    },
    "P.07.2": {
      text: "A family recipe, same-morning baking, and a five-office pilot they can see.",
    },
    "P.07.3": { text: "Reliability, presentation and convenience." },
    "P.07.4": { text: "The lowest price per piece." },
    "P.08.1": {
      text: "Boxes of 12 piaya sold to office accounts at ₱450, invoiced monthly.",
    },
    "P.08.2": {
      text: "Weekend sales to tourists from the kitchen, and seasonal bundles.",
    },
    "P.08.11": {
      text: "Most of it is a second oven and two months of working capital, which pays back within a year at the expected volume.",
    },
    "P.09.1": {
      text: "Free sample boxes to 20 offices we already know, then referrals between HR officers.",
    },
    "P.09.2": {
      text: "Direct visits, the Bacolod Business Owners group and Messenger.",
    },
    "P.09.3": {
      text: "HR officers trust recommendations from other HR officers more than ads.",
    },
    "P.10.1": {
      text: "Ana's family recipe and 8 years in HR with contacts at 20 Bacolod offices.",
    },
    "P.10.2": { text: "Bookkeeping and delivery logistics." },
    "P.10.3": {
      text: "Paolo sets up invoicing and courier accounts; an accountant files taxes monthly.",
    },
    "P.11.1": {
      rows: [
        {
          name: "Ana Villanueva",
          role: "Founder, sales and product",
          responsibilities: "Office accounts, recipes, quality",
          authority: "Prices, menu, hiring",
          time: "Full time",
        },
        {
          name: "Kenji Mori",
          role: "Kitchen operations",
          responsibilities: "Production, suppliers, food safety",
          authority: "Kitchen schedule and suppliers",
          time: "Part time",
        },
        {
          name: "Paolo Gonzaga",
          role: "Systems and delivery",
          responsibilities: "Ordering, invoicing, courier accounts",
          authority: "Tools and delivery partners",
          time: "Part time",
        },
      ],
    },
    "P.11.2": {
      text: "All three review orders and cash every Monday.",
    },
    "P.13.1": {
      rows: [
        {
          name: "Ana Villanueva",
          initial_ownership: 0.6,
          initial_capital: 120000,
        },
        { name: "Kenji Mori", initial_ownership: 0.2, initial_capital: 25000 },
        {
          name: "Paolo Gonzaga",
          initial_ownership: 0.2,
          initial_capital: 25000,
        },
      ],
    },
    "P.14.1": { text: "Sole proprietorship under Ana until break-even." },
    "P.14.2": { text: "DTI business name, BIR, barangay clearance." },
    "P.14.3": {
      text: "Mayor's permit and sanitary permit for the commissary.",
    },
    "P.20.2": {
      text: "₱40,000 working capital buffer, kept in a separate account.",
    },
    "P.20.10": {
      text: "About 4 months at the conservative case before the buffer runs out.",
    },
    "P.20.11": {
      text: "If the buffer falls below ₱15,000 before month 4, we ask the founders for ₱30,000 more.",
    },
    "P.22.1": {
      rows: [
        {
          risk: "Piaya goes stale before the gift is given.",
          probability: "Medium",
          impact: "High",
          mitigation:
            "Bake the same morning, print a best-before date and seal each box.",
          trigger_indicator: "Any complaint about freshness",
        },
        {
          risk: "Corporate demand is seasonal.",
          probability: "High",
          impact: "Medium",
          mitigation:
            "Add anniversary and onboarding gifts; sell to tourists on weekends.",
          trigger_indicator: "Orders below 150 in a month",
        },
        {
          risk: "A pasalubong brand starts delivering to offices.",
          probability: "Medium",
          impact: "Medium",
          mitigation:
            "Lock in monthly accounts with invoices and custom cards.",
          trigger_indicator: "A competitor advertises office delivery",
        },
        {
          risk: "Courier delays miss the morning deliveries.",
          probability: "Low",
          impact: "Medium",
          mitigation: "Deliver orders due before 10 a.m. ourselves.",
          trigger_indicator: "On-time rate below 95%",
        },
      ],
    },
    "P.24.1": {
      text: "At least 3 of the 5 pilot offices reorder within 4 weeks, and boxes stay fresh for 3 days.",
    },
    "P.24.2": {
      text: "Fewer than 3 offices reorder, or the kitchen lease is not signed.",
    },
    "P.24.3": {
      text: "No office reorders, or the expected case falls below break-even after the pilot.",
    },
    "P.27.1": { text: "Check orders and deliveries every morning." },
    "P.27.2": { text: "Monday review of orders, cash and complaints." },
    "P.27.3": { text: "Review the KPI scorecard with the advisors." },
    "P.30.1": {
      text: "We deliver Bacolod's piaya as a ready-to-give gift to offices before 10 a.m., with an invoice. Offices buy gifts every month and nobody else does this.",
    },
    "P.30.2": {
      text: "Start with the problem HR officers told us about, show the five-office pilot plan, walk through the numbers (break-even at 7 boxes a day, payback in about 9 months) and close with what we need from advisors.",
    },
  },
  presets: {
    "Business decision": [
      {
        assignee: "ana",
        dueInDays: -20,
        goal: "Decide whether to launch the gift box business",
        exitCondition: "Proceed recorded and plan drafted",
        status: "done",
        daysAgo: 26,
      },
    ],
    "Legal / company setup": [
      {
        assignee: "paolo",
        dueInDays: 25,
        status: "doing",
        goal: "Register the business and get the permits",
        exitCondition: "Mayor's permit and BIR registration in hand",
      },
    ],
    "Location / supplier readiness": [
      {
        assignee: "ana",
        dueInDays: 30,
        goal: "Kitchen lease and suppliers confirmed",
        exitCondition: "Lease signed; flour, ube and box suppliers on account",
      },
    ],
    "Product / service readiness": [
      {
        assignee: "kenji",
        dueInDays: 35,
        goal: "Four flavours tested and the box design final",
        exitCondition: "Three-day shelf test passed",
      },
    ],
    "Team readiness": [
      { assignee: "ana", dueInDays: 40, goal: "One baker hired and trained" },
    ],
    "Launch readiness": [
      {
        assignee: "ana",
        dueInDays: 45,
        goal: "First ten office accounts confirmed",
      },
    ],
    "30 days before launch": [
      {
        actions: "Sign the lease, order the oven, register with BIR",
        completionCriteria: "Kitchen ready for a trial",
        assignee: "ana",
      },
    ],
    "7 days before launch": [
      {
        actions: "Production trial, deliver sample boxes to 20 offices",
        completionCriteria: "Samples delivered on time",
        assignee: "kenji",
      },
    ],
    "Launch day": [
      {
        actions: "First paid deliveries to pilot offices",
        completionCriteria: "All boxes delivered before 10 a.m.",
        assignee: "ana",
      },
    ],
    "First 30 days": [
      {
        actions: "Collect feedback from every office and fix packaging",
        assignee: "paolo",
      },
    ],
    "Days 31–90": [
      {
        actions: "Sign monthly accounts, add the anniversary gift",
        assignee: "ana",
      },
    ],
    Revenue: [
      {
        kpiTarget: "₱117,000 a month",
        kpiReviewFrequency: "Monthly",
        assignee: "ana",
      },
    ],
    "Operating Profit": [
      {
        kpiTarget: "₱18,490 a month",
        kpiReviewFrequency: "Monthly",
        assignee: "ana",
      },
    ],
    "Contribution Margin": [
      { kpiTarget: "51%", kpiReviewFrequency: "Monthly", assignee: "paolo" },
    ],
    "Cash Balance": [
      {
        kpiTarget: "Above ₱40,000",
        kpiReviewFrequency: "Weekly",
        assignee: "paolo",
      },
    ],
    "Orders / Customers per Day": [
      { kpiTarget: "10 boxes", kpiReviewFrequency: "Weekly", assignee: "ana" },
    ],
    "Repeat Rate": [
      {
        kpiTarget: "60% of offices reorder each month",
        kpiReviewFrequency: "Monthly",
        assignee: "ana",
      },
    ],
    "Average Order Value": [
      {
        kpiTarget: "₱900 (2 boxes)",
        kpiReviewFrequency: "Monthly",
        assignee: "ana",
      },
    ],
    Complaints: [
      {
        kpiTarget: "Fewer than 2 a month",
        kpiReviewFrequency: "Weekly",
        assignee: "kenji",
      },
    ],
    "Capacity Utilization": [
      {
        kpiTarget: "40% of 25 boxes a day",
        kpiReviewFrequency: "Weekly",
        assignee: "kenji",
      },
    ],
    "Waste / Defect Rate": [
      {
        kpiTarget: "Under 3%",
        kpiReviewFrequency: "Weekly",
        assignee: "kenji",
      },
    ],
    "Service Time": [
      {
        kpiTarget: "Delivered by 10 a.m.",
        kpiReviewFrequency: "Weekly",
        assignee: "paolo",
      },
    ],
    "Staffing Cost": [
      {
        kpiTarget: "₱18,000 a month",
        kpiReviewFrequency: "Monthly",
        assignee: "ana",
      },
    ],
  },
  execution: [
    {
      type: "open_question",
      title: "Can piaya stay fresh for 3 days without preservatives?",
      whyItMatters: "Offices often give the gift a day or two after delivery.",
      assignee: "kenji",
      dueInDays: 20,
    },
    {
      type: "open_question",
      title: "Do offices need official receipts, or are invoices enough?",
      whyItMatters: "Decides whether we register for official receipts now.",
      assignee: "paolo",
      daysAgo: 20,
      later: [
        {
          answer:
            "BIR-registered invoices are enough for all three HR officers.",
          status: "resolved",
          daysAgo: 15,
          by: "paolo",
        },
      ],
    },
    {
      type: "next_action",
      title: "Get supplier quote",
      assignee: "kenji",
      dueInDays: -2,
    },
    {
      type: "next_action",
      title: "Book venue",
      assignee: "ana",
      dueInDays: 2,
      status: "doing",
    },
    {
      type: "next_action",
      title: "Send the pilot offer to five offices",
      assignee: "paolo",
      dueInDays: 12,
    },
    {
      type: "next_action",
      title: "Photograph the sample boxes",
      assignee: "ana",
      dueInDays: -12,
      daysAgo: 16,
      later: [{ status: "done", daysAgo: 11, by: "ana" }],
    },
  ],
};

/** Plan B: a draft made from the same Proceed, with no version (design-spec 8.2). */
export const PIAYA_PLAN_B: PlanSpec = {
  key: "b",
  name: "Plan B",
  creator: "paolo",
  createdDaysAgo: 15,
  editedDaysAgo: 15,
};
