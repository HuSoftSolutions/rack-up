export type MockBusiness = {
  id: string;
  name: string;
  description?: string;
  hero?: string;
};

export const mockBusinesses: MockBusiness[] = [
  {
    id: "the-bunker",
    name: "The Bunker",
    description: "Golf simulators and bar — pilot locations.",
  },
  {
    id: "partner-bar",
    name: "Partner Bar",
    description: "Nearby bar/restaurant partner.",
  },
];

export function findMockBusiness(businessId: string): MockBusiness | undefined {
  return mockBusinesses.find((b) => b.id === businessId);
}
