export type LibraryTimestamped = {
  created_at?: Date | string;
  updated_at?: Date | string;
};

const timestampOf = (item: LibraryTimestamped) => {
  const value = item.updated_at ?? item.created_at;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const sortLibraryItemsByRecent = <T extends LibraryTimestamped>(
  items: T[],
  getLabel: (item: T) => string,
) => [...items].sort((left, right) => (
  timestampOf(right) - timestampOf(left)
  || getLabel(left).localeCompare(getLabel(right), "ko")
));

export const getRecentLibraryItems = <T extends LibraryTimestamped>(
  items: T[],
  getLabel: (item: T) => string,
  limit = 6,
) => sortLibraryItemsByRecent(items, getLabel).slice(0, limit);

export const sortLibraryCategoryEntries = <T extends LibraryTimestamped>(
  grouped: Record<string, T[]>,
  getLabel: (item: T) => string,
) => Object.entries(grouped)
  .sort(([left], [right]) => left.localeCompare(right, "ko"))
  .map(([category, items]) => [category, sortLibraryItemsByRecent(items, getLabel)] as const);
