import type { IdeaSpec } from "../ideas";

/**
 * Laundry Pickup (design-spec 8.2): dropped because each kilo costs ₱75 to serve and
 * sells for ₱60, a contribution margin below zero.
 */
export const LAUNDRY: IdeaSpec = {
  key: "laundry",
  name: "Laundry Pickup",
  oneLineConcept:
    "Laundry pickup and delivery for students in boarding houses, priced per kilo.",
  proposedSolution:
    "Pick up twice a week from boarding houses near the universities, wash and fold at a partner laundry, deliver within 48 hours.",
  proposer: "paolo",
  createdDaysAgo: 70,
  template: "v1",
  workedDaysAgo: 60,
  researchLogs: [],
  competitors: [],
  assumptions: [],
  risks: [],
  costs: {
    "initial.equipment": {
      amount: 45000,
      fau: "assumption",
      confidence: "high",
      whyNeeded: "A second-hand motorbike with a box",
    },
    "initial.permits": {
      amount: 2500,
      fau: "assumption",
      confidence: "medium",
    },
    "initial.branding": { amount: 3000, fau: "assumption", confidence: "high" },
    "monthly.salaries": {
      amount: 12000,
      fau: "assumption",
      confidence: "high",
      notes: "One rider",
    },
    "monthly.utilities": {
      amount: 500,
      fau: "assumption",
      confidence: "medium",
    },
    "monthly.internet": { amount: 500, fau: "assumption", confidence: "high" },
    "monthly.marketing": {
      amount: 1000,
      fau: "assumption",
      confidence: "medium",
    },
    "variable.materials": {
      amount: 45,
      fau: "assumption",
      confidence: "high",
      notes: "Partner laundry's wash-and-fold rate per kilo",
    },
    "variable.packaging": { amount: 5, fau: "assumption", confidence: "high" },
    "variable.delivery": {
      amount: 20,
      fau: "assumption",
      confidence: "medium",
    },
    "variable.labor": { amount: 5, fau: "assumption", confidence: "medium" },
  },
  economics: {
    selling_price: { value: 60, fau: "assumption", confidence: "high" },
    operating_days: { value: 26, fau: "assumption", confidence: "high" },
    units_conservative: { value: 20, fau: "assumption", confidence: "medium" },
    units_expected: { value: 35, fau: "assumption", confidence: "medium" },
    units_strong: { value: 50, fau: "assumption", confidence: "low" },
    units_capacity: { value: 80, fau: "assumption", confidence: "high" },
  },
  answers: {
    "V.01.WHO": {
      text: "Students in boarding houses without a washing machine.",
      fau: "assumption",
      confidence: "high",
    },
    "V.01.PROBLEM": {
      text: "Carrying laundry to a shop and waiting takes half a Saturday.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.01.PAYMENT": {
      text: "Saves the trip and the wait.",
      fau: "assumption",
      confidence: "medium",
    },
    "V.08.WORTH": {
      text: "No: every kilo loses ₱15 before any fixed cost.",
      fau: "assumption",
      confidence: "high",
    },
  },
};

/** Sari-sari Store Delivery (design-spec 8.2): archived, so 13 is read only. */
export const SARI_SARI: IdeaSpec = {
  key: "sari-sari",
  name: "Sari-sari Store Delivery",
  oneLineConcept:
    "Next-morning restocking deliveries for sari-sari stores from a central warehouse.",
  proposedSolution:
    "Store owners order by text before 8 p.m.; we deliver basic goods the next morning at wholesale price plus a ₱50 delivery fee.",
  proposer: "kenji",
  createdDaysAgo: 65,
  template: "v1",
  workedDaysAgo: 58,
  archived: { daysAgo: 45 },
  researchLogs: [],
  competitors: [],
  assumptions: [],
  risks: [],
  costs: {
    "monthly.salaries": {
      amount: 15000,
      fau: "assumption",
      confidence: "medium",
    },
    "variable.delivery": {
      amount: 25,
      fau: "assumption",
      confidence: "medium",
    },
  },
  economics: {
    selling_price: { value: 50, fau: "assumption", confidence: "medium" },
    operating_days: { value: 26, fau: "assumption", confidence: "high" },
    units_expected: { value: 30, fau: "assumption", confidence: "low" },
  },
  answers: {
    "V.01.WHO": {
      text: "Sari-sari store owners in the barangays around Bacolod.",
      fau: "assumption",
      confidence: "high",
    },
    "V.01.PROBLEM": {
      text: "Owners close the store for half a day to restock at the market.",
      fau: "assumption",
      confidence: "medium",
    },
  },
};

/**
 * Mobile Bike Repair (design-spec 8.2): almost empty, for the empty states. The only idea
 * made on validation v2.
 */
export const BIKE_REPAIR: IdeaSpec = {
  key: "bike-repair",
  name: "Mobile Bike Repair",
  oneLineConcept:
    "On-site bicycle repair for commuters and delivery riders, booked by Messenger.",
  proposedSolution: null,
  proposer: "ana",
  createdDaysAgo: 3,
  template: "v2",
  workedDaysAgo: 2,
  researchLogs: [],
  competitors: [],
  assumptions: [],
  risks: [],
  costs: {},
  economics: {},
  answers: {
    "V.01.WHO": {
      text: "Delivery riders who lose a day's income when their bike breaks down.",
    },
    "V.01.PROBLEM": {
      text: "Repair shops are far from where bikes break down, and riders push them for kilometres.",
    },
  },
};
