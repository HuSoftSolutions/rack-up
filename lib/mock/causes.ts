export type DonationMode = "custom" | "predefined";

export type PredefinedOption = {
  amountCents: number;
  points: number;
  label?: string;
};

export type MockCause = {
  id: string;
  businessId: string;
  title: string;
  description?: string;
  mode: DonationMode;
  pointsPerDollar?: number; // used when mode=custom
  predefinedOptions?: PredefinedOption[]; // used when mode=predefined
  minAmountCents?: number;
  maxAmountCents?: number;
};

export const mockCauses: MockCause[] = [
  {
    id: "bunker-general-fund",
    businessId: "the-bunker",
    title: "Support The Bunker",
    description: "Keep the simulators humming and the lights on.",
    mode: "predefined",
    predefinedOptions: [
      { amountCents: 200, points: 100, label: "$2 → 100 pts" },
      { amountCents: 500, points: 300, label: "$5 → 300 pts" },
      { amountCents: 1000, points: 700, label: "$10 → 700 pts" },
    ],
  },
  {
    id: "partner-bar-giveback",
    businessId: "partner-bar",
    title: "Community Giveback",
    description: "Help fund local events and giveaways.",
    mode: "custom",
    pointsPerDollar: 100,
    minAmountCents: 200,
    maxAmountCents: 10000,
  },
];

export function findCauseByBusiness(businessId: string): MockCause | undefined {
  return mockCauses.find((c) => c.businessId === businessId);
}
