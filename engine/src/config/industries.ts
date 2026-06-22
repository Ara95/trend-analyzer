// Industry slugs for slicing trends. 'all' is the reserved sentinel for
// country-level (non-industry) trends — NEVER use null (see trends idempotency).
export const ALL_INDUSTRIES = 'all' as const;

export const INDUSTRIES = [
  'beauty',
  'fashion',
  'food',
  'fitness',
  'tech',
] as const;

export type Industry = (typeof INDUSTRIES)[number] | typeof ALL_INDUSTRIES;
