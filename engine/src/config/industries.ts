// Industry slugs for slicing trends. 'all' is the reserved sentinel for
// country-level (non-industry) trends — NEVER use null (see trends idempotency).
export const ALL_INDUSTRIES = 'all' as const;

export const INDUSTRIES = [
  'beauty',
  'fashion',
  'food',
  'fitness',
  'tech',
  'sports',
  'entertainment',
  'music',
  'gaming',
  'travel',
  'home',
  'family',
  'pets',
  'news',
  'finance',
  'automotive',
  'lifestyle',
] as const;

export type Industry = (typeof INDUSTRIES)[number] | typeof ALL_INDUSTRIES;

// A real industry — the classification target set, never the 'all' sentinel.
export type RealIndustry = (typeof INDUSTRIES)[number];

// Coarse UI-facing buckets. Restaurants/cafés map to 'food', gyms/wellness to
// 'fitness', etc. Finer emergent subcategories are surfaced by v2 semantic clustering,
// not by adding buckets here. These descriptions are the source text for the per-industry
// definition vectors (see src/classify/industryVectors.ts) used in zero-shot comparison.
export const INDUSTRY_DEFINITIONS: Record<RealIndustry, string> = {
  beauty:
    'Beauty, cosmetics, skincare, makeup, hair, nails and personal grooming. Tutorials, product reviews, salons and beauty brands.',
  fashion:
    'Fashion, clothing, apparel, outfits, styling, streetwear, accessories and footwear. Fashion brands, designers and try-on hauls.',
  food:
    'Food, cooking, recipes, baking, restaurants, cafés, coffee, drinks and dining. Chefs, food creators, eateries and the restaurant industry.',
  fitness:
    'Fitness, gym, workouts, training, exercise, sports, wellness, yoga and nutrition. Coaches, athletes and health & wellness studios.',
  tech: 'Technology, gadgets, software, apps, AI, computers, phones and consumer electronics. Tech reviews, startups and developers.',
  sports:
    'Sports, athletes and competitive teams — football/soccer, hockey, basketball, esports, match highlights, fans and leagues. Distinct from personal gym fitness.',
  entertainment:
    'Entertainment, comedy, humor, memes, sketches, pranks, celebrities, film and TV. Comedians, actors and viral funny clips.',
  music:
    'Music and dance — songs, artists, singing, instruments, concerts, choreography and dance trends and challenges.',
  gaming:
    'Video games and gaming culture — gameplay, streamers, consoles, PC gaming, esports titles, game reviews and let\'s plays.',
  travel:
    'Travel and tourism — destinations, trips, hotels, flights, city guides, nature, adventures and travel vlogs.',
  home:
    'Home and interior — interior design, home decor, furniture, renovation, DIY home projects, organizing and gardening.',
  family:
    'Family and parenting — children, pregnancy, babies, parenting tips, family life and everyday moments with kids.',
  pets: 'Pets and animals — dogs, cats and other pets, animal care, training, cute animal clips and wildlife.',
  news:
    'News, current events, politics and society — local and national news, social issues, debate and journalism. Not technology.',
  finance:
    'Finance, money and business — saving, investing, personal economy, entrepreneurship, careers and business tips.',
  automotive:
    'Cars and motoring — vehicles, car reviews, motorcycles, driving, motorsport and automotive culture.',
  lifestyle:
    'Lifestyle and everyday vlogs — daily routines, "day in my life", self-improvement, productivity and general lifestyle content not covered by a more specific category.',
};

// The real industries as an array, for zero-shot / tagging over the classification set.
export const REAL_INDUSTRIES: RealIndustry[] = [...INDUSTRIES];
