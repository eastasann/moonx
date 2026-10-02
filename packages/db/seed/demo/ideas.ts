import { uid } from "../lib/ids";
import type { World } from "../lib/rows";
import type { Clock } from "../lib/time";
import { bikeRepairSpec, healthBowlSpec, laundrySpec, studyCafeSpec } from "./ideas/others";
import { piayaSpec } from "./ideas/piaya";
import { BCDX, type PersonKey, userId } from "./ids";
import { addValidation, type ValidationData } from "./validation";

export type IdeaKey =
  | "piaya"
  | "piaya-corp"
  | "health-bowl"
  | "study-cafe"
  | "laundry"
  | "bike-repair";

export const ideaId = (key: IdeaKey) => uid("idea", key);

interface IdeaRow {
  key: IdeaKey;
  name: string;
  oneLineConcept: string;
  proposedSolution: string;
  proposer: PersonKey;
  latestDecision: "proceed" | "hold" | "drop" | null;
  duplicatedFrom?: IdeaKey;
  createdDaysAgo: number;
  lastActivityDaysAgo: number;
}

const IDEAS: IdeaRow[] = [
  {
    key: "piaya",
    name: "Piaya Gift Box Delivery",
    oneLineConcept: "Boxed piaya and local gifts delivered to offices and homes in Bacolod.",
    proposedSolution: "Order online, choose a delivery slot, and receive a gift-ready box.",
    proposer: "ana",
    latestDecision: "proceed",
    createdDaysAgo: 45,
    lastActivityDaysAgo: 0,
  },
  {
    key: "piaya-corp",
    name: "Piaya Gift Box (Corporate)",
    oneLineConcept: "Corporate gift boxes of Bacolod pasalubong, delivered on a schedule.",
    proposedSolution: "Order online, choose a delivery slot, and receive a gift-ready box.",
    proposer: "kenji",
    latestDecision: null,
    duplicatedFrom: "piaya",
    createdDaysAgo: 8,
    lastActivityDaysAgo: 2,
  },
  {
    key: "health-bowl",
    name: "Bacolod Health Bowl",
    oneLineConcept: "Healthy fast-casual bowls with standardized nutrition in Bacolod.",
    proposedSolution: "A focused menu with consistent portions and clearly communicated nutrition.",
    proposer: "kenji",
    latestDecision: "hold",
    createdDaysAgo: 30,
    lastActivityDaysAgo: 1,
  },
  {
    key: "study-cafe",
    name: "Student Study Café",
    oneLineConcept: "A quiet café with paid study seats near Bacolod universities.",
    proposedSolution: "Bookable study seats by the hour, with outlets, Wi-Fi and drinks.",
    proposer: "paolo",
    latestDecision: "proceed",
    createdDaysAgo: 90,
    lastActivityDaysAgo: 5,
  },
  {
    key: "laundry",
    name: "Laundry Pickup",
    oneLineConcept: "Pickup and delivery laundry for apartments in Bacolod.",
    proposedSolution: "Book a pickup in the app and get clean, folded laundry the next day.",
    proposer: "paolo",
    latestDecision: "drop",
    createdDaysAgo: 45,
    lastActivityDaysAgo: 15,
  },
  {
    key: "bike-repair",
    name: "Mobile Bike Repair",
    oneLineConcept: "Mobile bicycle repair that comes to your home or office.",
    proposedSolution: "A van with common parts and a mechanic who fixes the bike on the spot.",
    proposer: "ana",
    latestDecision: null,
    createdDaysAgo: 4,
    lastActivityDaysAgo: 3,
  },
];

export interface IdeaRecord {
  key: IdeaKey;
  id: string;
  name: string;
  oneLineConcept: string;
  proposedSolution: string;
  proposer: PersonKey;
  validation: ValidationData;
}

/** The six ideas of design-spec 8.2, each with its validation. */
export function addIdeas(world: World, clock: Clock): Record<IdeaKey, IdeaRecord> {
  const records = {} as Record<IdeaKey, IdeaRecord>;
  for (const row of IDEAS) {
    const id = ideaId(row.key);
    const created = clock.ago(row.createdDaysAgo);
    world.ideas.push({
      id,
      workspaceId: BCDX,
      name: row.name,
      oneLineConcept: row.oneLineConcept,
      proposedSolution: row.proposedSolution,
      proposerId: userId(row.proposer),
      duplicatedFromId: row.duplicatedFrom ? ideaId(row.duplicatedFrom) : null,
      latestDecision: row.latestDecision,
      lastActivityAt: clock.ago(row.lastActivityDaysAgo),
      updatedById: userId(row.proposer),
      createdAt: created,
      updatedAt: clock.ago(row.lastActivityDaysAgo),
    });

    const base = { key: row.key, ideaId: id, workspaceId: BCDX };
    const spec = {
      piaya: () =>
        piayaSpec({ ...base, by: "ana", price: 450, createdDaysAgo: row.createdDaysAgo }),
      "piaya-corp": () =>
        piayaSpec({ ...base, by: "kenji", price: 650, createdDaysAgo: row.createdDaysAgo }),
      "health-bowl": () => healthBowlSpec(base),
      "study-cafe": () => studyCafeSpec(base),
      laundry: () => laundrySpec(base),
      "bike-repair": () => bikeRepairSpec(base),
    }[row.key]();

    records[row.key] = {
      key: row.key,
      id,
      name: row.name,
      oneLineConcept: row.oneLineConcept,
      proposedSolution: row.proposedSolution,
      proposer: row.proposer,
      validation: addValidation(world, clock, spec),
    };
  }
  return records;
}
