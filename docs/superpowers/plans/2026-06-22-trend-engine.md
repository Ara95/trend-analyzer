# Social Media Trend Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js + TypeScript backend engine that ingests TikTok (Class A, Creative Center) and Instagram (Class B, derived velocity) and writes unified, country/industry/format-sliced trends over day/week/month windows into Supabase.

**Architecture:** A single shared `SourceAdapter` contract feeds one `trends` store. Class A adapters pass pre-computed trends straight through; Class B adapters emit raw `content_snapshots` that a pure `derive()` velocity engine turns into trends. Apify and Supabase clients are dependency-injected so all logic is unit-testable with fakes. A CLI worker wires real dependencies and is cron-ready.

**Tech Stack:** Node 20+, TypeScript, ESM, tsx (run), vitest (test), @supabase/supabase-js (service-role, server-side only), apify-client, Supabase Postgres + pgvector (enabled, clustering NOT implemented).

---

## File Structure

```
engine/
├─ src/
│  ├─ adapters/
│  │  ├─ contract.ts        # shared types + SourceAdapter interface + ActorRunner type
│  │  ├─ tiktok.ts          # Class A — Creative Center mapping
│  │  └─ instagram.ts       # Class B — reel snapshot mapping
│  ├─ engine/
│  │  └─ derive.ts          # velocity v1 (pure)
│  ├─ store/
│  │  ├─ apify.ts           # ActorRunner backed by apify-client
│  │  ├─ supabase.ts        # service-role client factory
│  │  ├─ accounts.ts        # list active panel accounts
│  │  ├─ snapshots.ts       # insert content_snapshots
│  │  └─ trends.ts          # idempotent upsert into trends
│  ├─ config/
│  │  ├─ env.ts             # env loading + validation
│  │  └─ industries.ts      # industry slugs + 'all' sentinel
│  ├─ engine.ts             # runEngine() orchestration (testable)
│  └─ worker.ts             # CLI entrypoint (parses argv, wires real deps)
├─ migrations/
│  └─ 0001_init.sql         # pgvector + tables
├─ .env.example
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
└─ README.md
web/                        # placeholder dir only (.gitkeep)
```

---

### Task 0: Scaffold monorepo + engine package

**Files:**
- Create: `engine/package.json`
- Create: `engine/tsconfig.json`
- Create: `engine/vitest.config.ts`
- Create: `engine/.env.example`
- Create: `.gitignore`
- Create: `web/.gitkeep`

- [ ] **Step 1: Initialize git (repo does not exist yet)**

Run:
```bash
cd /c/Users/Ara/trend-analyzer && git init
```
Expected: `Initialized empty Git repository`

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
dist/
.env
.env.local
*.log
```

- [ ] **Step 3: Create `web/.gitkeep`** (empty placeholder so the dir is tracked)

```
```

- [ ] **Step 4: Create `engine/package.json`**

```json
{
  "name": "@trend-analyzer/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "worker": "tsx src/worker.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "apify-client": "^2.9.0"
  },
  "devDependencies": {
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.14.0"
  }
}
```

- [ ] **Step 5: Create `engine/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create `engine/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 7: Create `engine/.env.example`** (placeholders only — no real secrets)

```dotenv
# Supabase (service-role key — SERVER-SIDE ONLY, never expose to the browser)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Apify
APIFY_TOKEN=your-apify-token

# Actor ids (swappable)
TIKTOK_ACTOR_ID=automation-lab/tiktok-trends-scraper
INSTAGRAM_ACTOR_ID=apify/instagram-reel-scraper
```

- [ ] **Step 8: Install dependencies**

Run:
```bash
cd /c/Users/Ara/trend-analyzer/engine && npm install
```
Expected: `node_modules/` created, no error exit.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "chore: scaffold monorepo + engine package"
```

---

### Task 1: Config — industries + env validation

**Files:**
- Create: `engine/src/config/industries.ts`
- Create: `engine/src/config/env.ts`
- Test: `engine/src/config/env.test.ts`

- [ ] **Step 1: Create `engine/src/config/industries.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test `engine/src/config/env.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'key',
  APIFY_TOKEN: 'tok',
};

describe('loadEnv', () => {
  it('returns config with actor defaults when optional vars absent', () => {
    const cfg = loadEnv(base);
    expect(cfg.supabaseUrl).toBe('https://x.supabase.co');
    expect(cfg.tiktokActorId).toBe('automation-lab/tiktok-trends-scraper');
    expect(cfg.instagramActorId).toBe('apify/instagram-reel-scraper');
  });

  it('lets env override actor ids', () => {
    const cfg = loadEnv({ ...base, TIKTOK_ACTOR_ID: 'other/actor' });
    expect(cfg.tiktokActorId).toBe('other/actor');
  });

  it('throws listing every missing required var', () => {
    expect(() => loadEnv({})).toThrow(/SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*APIFY_TOKEN/s);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/config/env.test.ts`
Expected: FAIL — cannot find module `./env.js`.

- [ ] **Step 4: Create `engine/src/config/env.ts`**

```ts
export interface EngineConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  apifyToken: string;
  tiktokActorId: string;
  instagramActorId: string;
}

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APIFY_TOKEN'] as const;

export function loadEnv(source: Record<string, string | undefined> = process.env): EngineConfig {
  const missing = REQUIRED.filter((k) => !source[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  return {
    supabaseUrl: source.SUPABASE_URL!,
    supabaseServiceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY!,
    apifyToken: source.APIFY_TOKEN!,
    tiktokActorId: source.TIKTOK_ACTOR_ID ?? 'automation-lab/tiktok-trends-scraper',
    instagramActorId: source.INSTAGRAM_ACTOR_ID ?? 'apify/instagram-reel-scraper',
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/config/env.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "feat(config): industries enum + validated env loader"
```

---

### Task 2: Shared adapter contract

**Files:**
- Create: `engine/src/adapters/contract.ts`
- Test: `engine/src/adapters/contract.test.ts`

- [ ] **Step 1: Write the failing test `engine/src/adapters/contract.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { isClassA, type SourceAdapter } from './contract.js';

const fakeA: SourceAdapter = {
  id: 'x', platform: 'tiktok', sourceClass: 'trend-feed',
  fetchTrends: async () => [], fetchSnapshots: async () => [],
};
const fakeB: SourceAdapter = {
  id: 'y', platform: 'instagram', sourceClass: 'raw-content',
  fetchTrends: async () => [], fetchSnapshots: async () => [],
};

describe('isClassA', () => {
  it('is true for trend-feed sources', () => expect(isClassA(fakeA)).toBe(true));
  it('is false for raw-content sources', () => expect(isClassA(fakeB)).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/adapters/contract.test.ts`
Expected: FAIL — cannot find module `./contract.js`.

- [ ] **Step 3: Create `engine/src/adapters/contract.ts`**

```ts
import type { Industry } from '../config/industries.js';

export type SourceClass = 'trend-feed' | 'raw-content';
export type Platform = 'tiktok' | 'instagram';
export type Format = 'hashtag' | 'audio' | 'video' | 'creator' | 'reel';
export type Period = 'day' | 'week' | 'month';
export type Direction = 'rising' | 'falling' | 'stable';

export interface RunContext {
  country: string; // ISO-2, e.g. 'SE'
  period: Period;
}

export interface PanelAccount {
  id: string;
  handle: string;
  platform: Platform;
  industry: Industry;
  country: string;
  active: boolean;
}

export interface NormalizedTrend {
  platform: Platform;
  format: Format;
  label: string;
  country: string;
  industry: Industry; // 'all' for country-level — never null
  period: Period;
  // Class A native (nullable for Class B):
  rank?: number;
  rankMovement?: number;
  direction?: Direction;
  views?: number;
  // Class B derived (nullable for Class A):
  velocityScore?: number;
  sampleSize?: number;
  sampleWindowDays?: number;
  metrics?: Record<string, unknown>;
}

export interface ContentSnapshot {
  platform: Platform;
  accountId: string;
  externalId: string; // reel/video id
  format: Format;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  audioId?: string;
  capturedAt: string; // ISO timestamp
  metrics?: Record<string, unknown>;
}

// Injected Apify boundary: takes an actor id + input, returns dataset items.
export type ActorRunner = (
  actorId: string,
  input: Record<string, unknown>,
) => Promise<unknown[]>;

export interface SourceAdapter {
  id: string;
  platform: Platform;
  sourceClass: SourceClass;
  fetchTrends(ctx: RunContext): Promise<NormalizedTrend[]>;
  fetchSnapshots(ctx: RunContext): Promise<ContentSnapshot[]>;
}

export function isClassA(a: SourceAdapter): boolean {
  return a.sourceClass === 'trend-feed';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/adapters/contract.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "feat(adapters): shared SourceAdapter contract + types"
```

---

### Task 3: Velocity engine (`derive.ts`)

**Files:**
- Create: `engine/src/engine/derive.ts`
- Test: `engine/src/engine/derive.test.ts`

- [ ] **Step 1: Write the failing test `engine/src/engine/derive.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { derive, periodWindowDays, engagement, DEFAULT_WEIGHTS } from './derive.js';
import type { ContentSnapshot, PanelAccount } from '../adapters/contract.js';

const acc: PanelAccount = {
  id: 'a1', handle: 'h', platform: 'instagram', industry: 'beauty', country: 'SE', active: true,
};
const accountsById = new Map([[acc.id, acc]]);

function snap(over: Partial<ContentSnapshot>): ContentSnapshot {
  return {
    platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel',
    views: 0, likes: 0, comments: 0, shares: 0, capturedAt: '2026-06-20T00:00:00.000Z',
    ...over,
  };
}

describe('periodWindowDays', () => {
  it('maps periods to lookback days', () => {
    expect(periodWindowDays('day')).toBe(1);
    expect(periodWindowDays('week')).toBe(7);
    expect(periodWindowDays('month')).toBe(30);
  });
});

describe('engagement', () => {
  it('is a weighted sum', () => {
    expect(engagement(snap({ likes: 1, comments: 1, shares: 1, views: 100 }), DEFAULT_WEIGHTS))
      .toBe(1 * 1 + 1 * 2 + 1 * 3 + 100 * 0.05);
  });
});

describe('derive', () => {
  it('skips reels with a single snapshot (cold start)', () => {
    const out = derive([snap({})], accountsById, { country: 'SE', period: 'week' });
    expect(out).toEqual([]);
  });

  it('computes per-day velocity for a reel across two snapshots', () => {
    const out = derive(
      [
        snap({ likes: 0, capturedAt: '2026-06-19T00:00:00.000Z' }),
        snap({ likes: 10, capturedAt: '2026-06-21T00:00:00.000Z' }),
      ],
      accountsById,
      { country: 'SE', period: 'week' },
    );
    const reel = out.find((t) => t.format === 'reel');
    expect(reel?.velocityScore).toBe(5); // 10 engagement over 2 days
    expect(reel?.industry).toBe('beauty');
    expect(reel?.label).toBe('r1');
    expect(reel?.sampleSize).toBe(2);
    expect(reel?.sampleWindowDays).toBe(2);
  });

  it('aggregates audio velocity per audioId within an industry', () => {
    const out = derive(
      [
        snap({ externalId: 'r1', audioId: 's1', likes: 0, capturedAt: '2026-06-19T00:00:00.000Z' }),
        snap({ externalId: 'r1', audioId: 's1', likes: 4, capturedAt: '2026-06-20T00:00:00.000Z' }),
        snap({ externalId: 'r2', audioId: 's1', likes: 0, capturedAt: '2026-06-19T00:00:00.000Z' }),
        snap({ externalId: 'r2', audioId: 's1', likes: 6, capturedAt: '2026-06-20T00:00:00.000Z' }),
      ],
      accountsById,
      { country: 'SE', period: 'week' },
    );
    const audio = out.find((t) => t.format === 'audio');
    expect(audio?.label).toBe('s1');
    expect(audio?.velocityScore).toBe(10); // 4/day + 6/day
    expect(audio?.sampleSize).toBe(2); // two reels
  });

  it('drops snapshots outside the period window', () => {
    const out = derive(
      [
        snap({ likes: 0, capturedAt: '2026-05-01T00:00:00.000Z' }), // outside 7d of latest
        snap({ likes: 10, capturedAt: '2026-06-21T00:00:00.000Z' }),
      ],
      accountsById,
      { country: 'SE', period: 'week' },
    );
    expect(out).toEqual([]); // only one snapshot remains in window -> cold start
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/engine/derive.test.ts`
Expected: FAIL — cannot find module `./derive.js`.

- [ ] **Step 3: Create `engine/src/engine/derive.ts`**

```ts
import type {
  ContentSnapshot,
  NormalizedTrend,
  PanelAccount,
  Period,
  RunContext,
} from '../adapters/contract.js';
import type { Industry } from '../config/industries.js';

const MS_PER_DAY = 86_400_000;

export interface Weights {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}

export const DEFAULT_WEIGHTS: Weights = { likes: 1, comments: 2, shares: 3, views: 0.05 };

export interface DeriveOptions {
  weights?: Weights;
  topN?: number;
}

export function periodWindowDays(period: Period): number {
  return period === 'day' ? 1 : period === 'week' ? 7 : 30;
}

export function engagement(s: ContentSnapshot, w: Weights): number {
  return s.likes * w.likes + s.comments * w.comments + s.shares * w.shares + s.views * w.views;
}

interface ReelVelocity {
  externalId: string;
  audioId?: string;
  industry: Industry;
  velocity: number;
  sampleSize: number;
  windowDays: number;
}

export function derive(
  snapshots: ContentSnapshot[],
  accountsById: Map<string, PanelAccount>,
  ctx: RunContext,
  opts: DeriveOptions = {},
): NormalizedTrend[] {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const topN = opts.topN ?? 50;
  if (snapshots.length === 0) return [];

  // Reference "now" = latest capture; window filters relative to it (deterministic).
  const refMs = Math.max(...snapshots.map((s) => Date.parse(s.capturedAt)));
  const windowMs = periodWindowDays(ctx.period) * MS_PER_DAY;
  const inWindow = snapshots.filter((s) => refMs - Date.parse(s.capturedAt) <= windowMs);

  // Per-reel velocity (needs >=2 snapshots in window).
  const byReel = new Map<string, ContentSnapshot[]>();
  for (const s of inWindow) {
    const arr = byReel.get(s.externalId) ?? [];
    arr.push(s);
    byReel.set(s.externalId, arr);
  }

  const reels: ReelVelocity[] = [];
  for (const [externalId, group] of byReel) {
    if (group.length < 2) continue; // cold start
    const sorted = [...group].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const deltaDays = (Date.parse(last.capturedAt) - Date.parse(first.capturedAt)) / MS_PER_DAY;
    if (deltaDays <= 0) continue;
    const velocity = (engagement(last, weights) - engagement(first, weights)) / deltaDays;
    const industry = accountsById.get(last.accountId)?.industry ?? 'all';
    reels.push({
      externalId,
      audioId: last.audioId,
      industry,
      velocity,
      sampleSize: group.length,
      windowDays: Math.round(deltaDays),
    });
  }

  const reelTrends: NormalizedTrend[] = reels.map((r) => ({
    platform: 'instagram',
    format: 'reel',
    label: r.externalId,
    country: ctx.country,
    industry: r.industry,
    period: ctx.period,
    velocityScore: r.velocity,
    sampleSize: r.sampleSize,
    sampleWindowDays: r.windowDays,
  }));

  // Audio trends: sum reel velocities grouped by (industry, audioId).
  const byAudio = new Map<string, ReelVelocity[]>();
  for (const r of reels) {
    if (!r.audioId) continue;
    const key = `${r.industry} ${r.audioId}`;
    const arr = byAudio.get(key) ?? [];
    arr.push(r);
    byAudio.set(key, arr);
  }

  const audioTrends: NormalizedTrend[] = [];
  for (const [, group] of byAudio) {
    const velocity = group.reduce((sum, r) => sum + r.velocity, 0);
    audioTrends.push({
      platform: 'instagram',
      format: 'audio',
      label: group[0].audioId!,
      country: ctx.country,
      industry: group[0].industry,
      period: ctx.period,
      velocityScore: velocity,
      sampleSize: group.length,
      sampleWindowDays: Math.max(...group.map((r) => r.windowDays)),
    });
  }

  return rankTopN([...reelTrends, ...audioTrends], topN);
}

// Keep only the top-N trends (by velocity, desc) within each (industry, format) bucket.
function rankTopN(trends: NormalizedTrend[], topN: number): NormalizedTrend[] {
  const buckets = new Map<string, NormalizedTrend[]>();
  for (const t of trends) {
    const key = `${t.industry} ${t.format}`;
    const arr = buckets.get(key) ?? [];
    arr.push(t);
    buckets.set(key, arr);
  }
  const out: NormalizedTrend[] = [];
  for (const [, arr] of buckets) {
    arr.sort((a, b) => (b.velocityScore ?? 0) - (a.velocityScore ?? 0));
    out.push(...arr.slice(0, topN));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/engine/derive.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "feat(engine): velocity v1 derive with cold-start handling"
```

---

### Task 4: Store — Supabase client, accounts, snapshots, trends upsert

**Files:**
- Create: `engine/src/store/supabase.ts`
- Create: `engine/src/store/accounts.ts`
- Create: `engine/src/store/snapshots.ts`
- Create: `engine/src/store/trends.ts`
- Test: `engine/src/store/trends.test.ts`
- Test: `engine/src/store/snapshots.test.ts`
- Test: `engine/src/store/accounts.test.ts`

The three store modules each take a minimal injected client so they are testable without a network. We define a `SupabaseLike` shape that the real `@supabase/supabase-js` client satisfies structurally.

- [ ] **Step 1: Create `engine/src/store/supabase.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EngineConfig } from '../config/env.js';

export function createSupabase(cfg: EngineConfig): SupabaseClient {
  // Service-role client — SERVER-SIDE ONLY. No session persistence in a worker.
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 2: Write the failing test `engine/src/store/trends.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { upsertTrends, TRENDS_CONFLICT } from './trends.js';
import type { NormalizedTrend } from '../adapters/contract.js';

function fakeClient() {
  const calls: any[] = [];
  return {
    calls,
    from(table: string) {
      return {
        upsert: async (rows: any[], opts: any) => {
          calls.push({ table, rows, opts });
          return { error: null };
        },
      };
    },
  };
}

const trend: NormalizedTrend = {
  platform: 'tiktok', format: 'hashtag', label: '#fika', country: 'SE',
  industry: 'food', period: 'week', rank: 1, rankMovement: 3, direction: 'rising',
};

describe('upsertTrends', () => {
  it('no-ops on empty input', async () => {
    const c = fakeClient();
    await upsertTrends(c as any, 'tiktok', [trend].slice(0, 0));
    expect(c.calls).toHaveLength(0);
  });

  it('maps trends to rows and upserts with the conflict key', async () => {
    const c = fakeClient();
    await upsertTrends(c as any, 'tiktok', [trend]);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0].table).toBe('trends');
    expect(c.calls[0].opts).toEqual({ onConflict: TRENDS_CONFLICT });
    const row = c.calls[0].rows[0];
    expect(row).toMatchObject({
      source: 'tiktok', source_class: 'trend-feed', platform: 'tiktok',
      country: 'SE', industry: 'food', format: 'hashtag', label: '#fika',
      period: 'week', rank: 1, rank_movement: 3, direction: 'rising',
    });
    expect(typeof row.computed_at).toBe('string');
  });

  it('throws when the client returns an error', async () => {
    const c = {
      from: () => ({ upsert: async () => ({ error: { message: 'boom' } }) }),
    };
    await expect(upsertTrends(c as any, 'tiktok', [trend])).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/store/trends.test.ts`
Expected: FAIL — cannot find module `./trends.js`.

- [ ] **Step 4: Create `engine/src/store/trends.ts`**

```ts
import type { NormalizedTrend, Platform } from '../adapters/contract.js';

export const TRENDS_CONFLICT = 'source,platform,country,industry,format,label,period';

export interface SupabaseLike {
  from(table: string): {
    upsert(rows: unknown[], opts: { onConflict: string }): Promise<{ error: { message: string } | null }>;
    insert(rows: unknown[]): Promise<{ error: { message: string } | null }>;
    select(columns?: string): any;
  };
}

const SOURCE_CLASS = {
  tiktok: 'trend-feed',
  instagram: 'raw-content',
} as const;

export async function upsertTrends(
  client: SupabaseLike,
  source: Platform,
  trends: NormalizedTrend[],
): Promise<void> {
  if (trends.length === 0) return;
  const computedAt = new Date().toISOString();
  const rows = trends.map((t) => ({
    source,
    source_class: SOURCE_CLASS[source],
    platform: t.platform,
    country: t.country,
    industry: t.industry,
    format: t.format,
    label: t.label,
    period: t.period,
    rank: t.rank ?? null,
    rank_movement: t.rankMovement ?? null,
    direction: t.direction ?? null,
    views: t.views ?? null,
    velocity_score: t.velocityScore ?? null,
    sample_size: t.sampleSize ?? null,
    sample_window_days: t.sampleWindowDays ?? null,
    metrics: t.metrics ?? {},
    computed_at: computedAt,
  }));
  const { error } = await client.from('trends').upsert(rows, { onConflict: TRENDS_CONFLICT });
  if (error) throw new Error(`upsertTrends failed: ${error.message}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/store/trends.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing test `engine/src/store/snapshots.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { insertSnapshots } from './snapshots.js';
import type { ContentSnapshot } from '../adapters/contract.js';

const snap: ContentSnapshot = {
  platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel',
  views: 100, likes: 5, comments: 2, shares: 1, audioId: 's1',
  capturedAt: '2026-06-20T00:00:00.000Z',
};

function fakeClient() {
  const calls: any[] = [];
  return {
    calls,
    from(table: string) {
      return { insert: async (rows: any[]) => { calls.push({ table, rows }); return { error: null }; } };
    },
  };
}

describe('insertSnapshots', () => {
  it('no-ops on empty input', async () => {
    const c = fakeClient();
    await insertSnapshots(c as any, []);
    expect(c.calls).toHaveLength(0);
  });

  it('maps snapshots to snake_case rows', async () => {
    const c = fakeClient();
    await insertSnapshots(c as any, [snap]);
    expect(c.calls[0].table).toBe('content_snapshots');
    expect(c.calls[0].rows[0]).toMatchObject({
      platform: 'instagram', account_id: 'a1', external_id: 'r1', format: 'reel',
      views: 100, likes: 5, comments: 2, shares: 1, audio_id: 's1',
      captured_at: '2026-06-20T00:00:00.000Z',
    });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/store/snapshots.test.ts`
Expected: FAIL — cannot find module `./snapshots.js`.

- [ ] **Step 8: Create `engine/src/store/snapshots.ts`**

```ts
import type { ContentSnapshot } from '../adapters/contract.js';
import type { SupabaseLike } from './trends.js';

export async function insertSnapshots(
  client: SupabaseLike,
  snapshots: ContentSnapshot[],
): Promise<void> {
  if (snapshots.length === 0) return;
  const rows = snapshots.map((s) => ({
    platform: s.platform,
    account_id: s.accountId,
    external_id: s.externalId,
    format: s.format,
    views: s.views,
    likes: s.likes,
    comments: s.comments,
    shares: s.shares,
    audio_id: s.audioId ?? null,
    captured_at: s.capturedAt,
    metrics: s.metrics ?? {},
  }));
  const { error } = await client.from('content_snapshots').insert(rows);
  if (error) throw new Error(`insertSnapshots failed: ${error.message}`);
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/store/snapshots.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Write the failing test `engine/src/store/accounts.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { listActiveAccounts } from './accounts.js';

// Fake the supabase query builder chain: from().select().eq().eq().eq()
function fakeClient(rows: any[]) {
  const filters: any[] = [];
  const builder: any = {
    select() { return builder; },
    eq(col: string, val: unknown) { filters.push([col, val]); return builder; },
    then(resolve: (v: any) => void) { resolve({ data: rows, error: null }); },
  };
  return { filters, from: () => builder };
}

describe('listActiveAccounts', () => {
  it('filters by platform, country, active and maps rows', async () => {
    const c = fakeClient([
      { id: 'a1', handle: 'h', platform: 'instagram', industry: 'beauty', country: 'SE', active: true },
    ]);
    const accounts = await listActiveAccounts(c as any, 'instagram', 'SE');
    expect(c.filters).toEqual([['platform', 'instagram'], ['country', 'SE'], ['active', true]]);
    expect(accounts[0]).toMatchObject({ id: 'a1', industry: 'beauty' });
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/store/accounts.test.ts`
Expected: FAIL — cannot find module `./accounts.js`.

- [ ] **Step 12: Create `engine/src/store/accounts.ts`**

```ts
import type { PanelAccount, Platform } from '../adapters/contract.js';

interface AccountsClientLike {
  from(table: string): {
    select(columns?: string): {
      eq(col: string, val: unknown): any;
    };
  };
}

export async function listActiveAccounts(
  client: AccountsClientLike,
  platform: Platform,
  country: string,
): Promise<PanelAccount[]> {
  const { data, error } = await client
    .from('accounts')
    .select('id, handle, platform, industry, country, active')
    .eq('platform', platform)
    .eq('country', country)
    .eq('active', true);
  if (error) throw new Error(`listActiveAccounts failed: ${error.message}`);
  return (data ?? []) as PanelAccount[];
}
```

- [ ] **Step 13: Run test to verify it passes**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/store/accounts.test.ts`
Expected: PASS (1 test).

- [ ] **Step 14: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "feat(store): supabase client + accounts/snapshots/trends persistence"
```

---

### Task 5: Apify actor runner

**Files:**
- Create: `engine/src/store/apify.ts`
- Test: `engine/src/store/apify.test.ts`

- [ ] **Step 1: Write the failing test `engine/src/store/apify.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { makeActorRunner } from './apify.js';

function fakeApifyClient(items: unknown[]) {
  const seen: any = {};
  return {
    seen,
    actor(actorId: string) {
      seen.actorId = actorId;
      return {
        call: async (input: unknown) => { seen.input = input; return { defaultDatasetId: 'ds1' }; },
      };
    },
    dataset(id: string) {
      seen.datasetId = id;
      return { listItems: async () => ({ items }) };
    },
  };
}

describe('makeActorRunner', () => {
  it('calls the actor and returns dataset items', async () => {
    const client = fakeApifyClient([{ a: 1 }]);
    const run = makeActorRunner(client as any);
    const items = await run('some/actor', { country: 'SE' });
    expect(client.seen.actorId).toBe('some/actor');
    expect(client.seen.input).toEqual({ country: 'SE' });
    expect(client.seen.datasetId).toBe('ds1');
    expect(items).toEqual([{ a: 1 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/store/apify.test.ts`
Expected: FAIL — cannot find module `./apify.js`.

- [ ] **Step 3: Create `engine/src/store/apify.ts`**

```ts
import { ApifyClient } from 'apify-client';
import type { ActorRunner } from '../adapters/contract.js';

// Minimal structural shape of the parts of ApifyClient we use (keeps tests simple).
interface ApifyLike {
  actor(actorId: string): { call(input: unknown): Promise<{ defaultDatasetId: string }> };
  dataset(id: string): { listItems(): Promise<{ items: unknown[] }> };
}

export function makeActorRunner(client: ApifyLike): ActorRunner {
  return async (actorId, input) => {
    const run = await client.actor(actorId).call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items;
  };
}

export function createApify(token: string): ActorRunner {
  return makeActorRunner(new ApifyClient({ token }) as unknown as ApifyLike);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/store/apify.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "feat(store): injectable Apify actor runner"
```

---

### Task 6: Instagram adapter (Class B)

**Files:**
- Create: `engine/src/adapters/instagram.ts`
- Test: `engine/src/adapters/instagram.test.ts`

> Apify output field names for `apify/instagram-reel-scraper` are confirmed against the actor docs at implementation time. The mapping below targets the documented fields (`id`/`shortCode`, `videoViewCount`/`videoPlayCount`, `likesCount`, `commentsCount`, `musicInfo.audio_id`). Adjust the field reads in `mapReel` only — the contract output must not change.

- [ ] **Step 1: Write the failing test `engine/src/adapters/instagram.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createInstagramAdapter } from './instagram.js';
import type { PanelAccount } from './contract.js';

const accounts: PanelAccount[] = [
  { id: 'a1', handle: 'beautyswe', platform: 'instagram', industry: 'beauty', country: 'SE', active: true },
];

const rawReel = {
  id: 'r1', ownerUsername: 'beautyswe', videoPlayCount: 1000, likesCount: 50,
  commentsCount: 10, sharesCount: 2, musicInfo: { audio_id: 's1' },
};

describe('instagram adapter', () => {
  it('is a Class B raw-content source that returns no trends', async () => {
    const adapter = createInstagramAdapter({
      runActor: async () => [], listAccounts: async () => accounts, actorId: 'x',
    });
    expect(adapter.sourceClass).toBe('raw-content');
    expect(await adapter.fetchTrends({ country: 'SE', period: 'day' })).toEqual([]);
  });

  it('maps raw reels to snapshots keyed to the panel account', async () => {
    const adapter = createInstagramAdapter({
      runActor: async () => [rawReel], listAccounts: async () => accounts, actorId: 'x',
    });
    const snaps = await adapter.fetchSnapshots({ country: 'SE', period: 'day' });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({
      platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel',
      views: 1000, likes: 50, comments: 10, shares: 2, audioId: 's1',
    });
    expect(typeof snaps[0].capturedAt).toBe('string');
  });

  it('skips reels whose owner is not in the panel', async () => {
    const adapter = createInstagramAdapter({
      runActor: async () => [{ ...rawReel, ownerUsername: 'stranger' }],
      listAccounts: async () => accounts, actorId: 'x',
    });
    expect(await adapter.fetchSnapshots({ country: 'SE', period: 'day' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/adapters/instagram.test.ts`
Expected: FAIL — cannot find module `./instagram.js`.

- [ ] **Step 3: Create `engine/src/adapters/instagram.ts`**

```ts
import type {
  ActorRunner,
  ContentSnapshot,
  PanelAccount,
  RunContext,
  SourceAdapter,
} from './contract.js';

export interface InstagramDeps {
  runActor: ActorRunner;
  listAccounts: () => Promise<PanelAccount[]>;
  actorId: string;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function createInstagramAdapter(deps: InstagramDeps): SourceAdapter {
  return {
    id: 'instagram',
    platform: 'instagram',
    sourceClass: 'raw-content',

    async fetchTrends(): Promise<[]> {
      return []; // Class B derives trends from snapshots, not here.
    },

    async fetchSnapshots(_ctx: RunContext): Promise<ContentSnapshot[]> {
      const accounts = await deps.listAccounts();
      const byHandle = new Map(accounts.map((a) => [a.handle.toLowerCase(), a]));
      const items = await deps.runActor(deps.actorId, {
        username: accounts.map((a) => a.handle),
      });
      const capturedAt = new Date().toISOString();
      const snapshots: ContentSnapshot[] = [];
      for (const raw of items as Record<string, any>[]) {
        const account = byHandle.get(String(raw.ownerUsername ?? '').toLowerCase());
        if (!account) continue; // not part of the curated panel
        snapshots.push({
          platform: 'instagram',
          accountId: account.id,
          externalId: String(raw.id ?? raw.shortCode),
          format: 'reel',
          views: num(raw.videoPlayCount ?? raw.videoViewCount),
          likes: num(raw.likesCount),
          comments: num(raw.commentsCount),
          shares: num(raw.sharesCount),
          audioId: raw.musicInfo?.audio_id ? String(raw.musicInfo.audio_id) : undefined,
          capturedAt,
        });
      }
      return snapshots;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/adapters/instagram.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "feat(adapters): Instagram Class B reel snapshot adapter"
```

---

### Task 7: TikTok adapter (Class A)

**Files:**
- Create: `engine/src/adapters/tiktok.ts`
- Test: `engine/src/adapters/tiktok.test.ts`

> Apify output field names for `automation-lab/tiktok-trends-scraper` are confirmed against the actor docs at implementation time. Mapping targets documented fields: items carry a `type` (`'hashtag'` | `'sound'`), hashtags carry `industry`, `rank`, `rankDiff`, `trend` direction, `views`; sounds carry `rank`, `title`, `audioLink`. Adjust field reads in the mappers only.

- [ ] **Step 1: Write the failing test `engine/src/adapters/tiktok.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createTikTokAdapter, periodToDays } from './tiktok.js';

const rawHashtag = {
  type: 'hashtag', hashtagName: 'fika', industry: 'food', rank: 1, rankDiff: 2,
  trend: 'rising', views: 500000,
};
const rawSound = { type: 'sound', title: 'Sommar', rank: 1, audioLink: 'http://a', usageCount: 9000 };

describe('periodToDays', () => {
  it('maps week->7 and month->30', () => {
    expect(periodToDays('week')).toBe(7);
    expect(periodToDays('month')).toBe(30);
  });
  it('throws for day (not offered by Creative Center)', () => {
    expect(() => periodToDays('day')).toThrow(/day/);
  });
});

describe('tiktok adapter', () => {
  it('is a Class A trend-feed source that returns no snapshots', async () => {
    const adapter = createTikTokAdapter({ runActor: async () => [], actorId: 'x' });
    expect(adapter.sourceClass).toBe('trend-feed');
    expect(await adapter.fetchSnapshots({ country: 'SE', period: 'week' })).toEqual([]);
  });

  it('maps hashtags per industry with native rank fields', async () => {
    const adapter = createTikTokAdapter({ runActor: async () => [rawHashtag], actorId: 'x' });
    const trends = await adapter.fetchTrends({ country: 'SE', period: 'week' });
    const h = trends.find((t) => t.format === 'hashtag');
    expect(h).toMatchObject({
      platform: 'tiktok', format: 'hashtag', label: 'fika', country: 'SE',
      industry: 'food', period: 'week', rank: 1, rankMovement: 2, direction: 'rising', views: 500000,
    });
  });

  it('maps sounds as country-level (industry all)', async () => {
    const adapter = createTikTokAdapter({ runActor: async () => [rawSound], actorId: 'x' });
    const trends = await adapter.fetchTrends({ country: 'SE', period: 'week' });
    const s = trends.find((t) => t.format === 'audio');
    expect(s).toMatchObject({
      platform: 'tiktok', format: 'audio', label: 'Sommar', industry: 'all', rank: 1,
    });
    expect(s?.metrics).toMatchObject({ audioLink: 'http://a', usageCount: 9000 });
  });

  it('passes the mapped day-count to the actor input', async () => {
    let received: any;
    const adapter = createTikTokAdapter({
      runActor: async (_id, input) => { received = input; return []; }, actorId: 'x',
    });
    await adapter.fetchTrends({ country: 'SE', period: 'month' });
    expect(received).toMatchObject({ countryCode: 'SE', period: 30 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/adapters/tiktok.test.ts`
Expected: FAIL — cannot find module `./tiktok.js`.

- [ ] **Step 3: Create `engine/src/adapters/tiktok.ts`**

```ts
import type {
  ActorRunner,
  Direction,
  NormalizedTrend,
  Period,
  RunContext,
  SourceAdapter,
} from './contract.js';
import { ALL_INDUSTRIES, type Industry } from '../config/industries.js';

export interface TikTokDeps {
  runActor: ActorRunner;
  actorId: string;
}

export function periodToDays(period: Period): number {
  if (period === 'week') return 7;
  if (period === 'month') return 30;
  throw new Error(`TikTok Creative Center has no 'day' window; got period='${period}'`);
}

function direction(v: unknown): Direction | undefined {
  return v === 'rising' || v === 'falling' || v === 'stable' ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function createTikTokAdapter(deps: TikTokDeps): SourceAdapter {
  return {
    id: 'tiktok',
    platform: 'tiktok',
    sourceClass: 'trend-feed',

    async fetchTrends(ctx: RunContext): Promise<NormalizedTrend[]> {
      const days = periodToDays(ctx.period);
      const items = (await deps.runActor(deps.actorId, {
        countryCode: ctx.country,
        period: days,
      })) as Record<string, any>[];

      const trends: NormalizedTrend[] = [];
      for (const raw of items) {
        if (raw.type === 'hashtag') {
          trends.push({
            platform: 'tiktok',
            format: 'hashtag',
            label: String(raw.hashtagName ?? raw.name),
            country: ctx.country,
            industry: (raw.industry as Industry) ?? ALL_INDUSTRIES,
            period: ctx.period,
            rank: num(raw.rank),
            rankMovement: num(raw.rankDiff),
            direction: direction(raw.trend),
            views: num(raw.views),
          });
        } else if (raw.type === 'sound' || raw.type === 'song') {
          trends.push({
            platform: 'tiktok',
            format: 'audio',
            label: String(raw.title ?? raw.name),
            country: ctx.country,
            industry: ALL_INDUSTRIES, // sounds are country-level only
            period: ctx.period,
            rank: num(raw.rank),
            rankMovement: num(raw.rankDiff),
            metrics: { audioLink: raw.audioLink, usageCount: raw.usageCount },
          });
        }
      }
      return trends;
    },

    async fetchSnapshots(): Promise<[]> {
      return []; // Class A — pre-computed, no raw content.
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/adapters/tiktok.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "feat(adapters): TikTok Class A Creative Center adapter"
```

---

### Task 8: Engine orchestration (`runEngine`)

**Files:**
- Create: `engine/src/engine.ts`
- Test: `engine/src/engine.test.ts`

- [ ] **Step 1: Write the failing test `engine/src/engine.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { runEngine, type EngineDeps } from './engine.js';
import type { NormalizedTrend, ContentSnapshot, SourceAdapter, PanelAccount } from './adapters/contract.js';

const account: PanelAccount = {
  id: 'a1', handle: 'h', platform: 'instagram', industry: 'beauty', country: 'SE', active: true,
};

const tiktokTrend: NormalizedTrend = {
  platform: 'tiktok', format: 'hashtag', label: '#fika', country: 'SE',
  industry: 'food', period: 'week',
};

const igSnaps: ContentSnapshot[] = [
  { platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel', views: 0, likes: 0, comments: 0, shares: 0, capturedAt: '2026-06-19T00:00:00.000Z' },
  { platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel', views: 0, likes: 20, comments: 0, shares: 0, capturedAt: '2026-06-21T00:00:00.000Z' },
];

function makeDeps() {
  const upserted: any[] = [];
  const inserted: any[] = [];
  const tiktok: SourceAdapter = {
    id: 'tiktok', platform: 'tiktok', sourceClass: 'trend-feed',
    fetchTrends: async () => [tiktokTrend], fetchSnapshots: async () => [],
  };
  const instagram: SourceAdapter = {
    id: 'instagram', platform: 'instagram', sourceClass: 'raw-content',
    fetchTrends: async () => [], fetchSnapshots: async () => igSnaps,
  };
  const deps: EngineDeps = {
    adapters: { tiktok, instagram },
    listAccounts: async () => [account],
    insertSnapshots: async (s) => { inserted.push(...s); },
    upsertTrends: async (_src, t) => { upserted.push(...t); },
  };
  return { deps, upserted, inserted };
}

describe('runEngine', () => {
  it('Class A: passes trends straight to upsert, no snapshots', async () => {
    const { deps, upserted, inserted } = makeDeps();
    await runEngine(deps, { source: 'tiktok', country: 'SE', period: 'week' });
    expect(upserted).toEqual([tiktokTrend]);
    expect(inserted).toHaveLength(0);
  });

  it('Class B: stores snapshots then upserts derived trends', async () => {
    const { deps, upserted, inserted } = makeDeps();
    await runEngine(deps, { source: 'instagram', country: 'SE', period: 'week' });
    expect(inserted).toEqual(igSnaps);
    const reel = upserted.find((t) => t.format === 'reel');
    expect(reel?.velocityScore).toBe(10); // 20 likes over 2 days
  });

  it('throws on unknown source', async () => {
    const { deps } = makeDeps();
    await expect(runEngine(deps, { source: 'nope' as any, country: 'SE', period: 'week' }))
      .rejects.toThrow(/unknown source/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/engine.test.ts`
Expected: FAIL — cannot find module `./engine.js`.

- [ ] **Step 3: Create `engine/src/engine.ts`**

```ts
import type {
  ContentSnapshot,
  NormalizedTrend,
  PanelAccount,
  Period,
  Platform,
  SourceAdapter,
} from './adapters/contract.js';
import { isClassA } from './adapters/contract.js';
import { derive } from './engine/derive.js';

export interface EngineDeps {
  adapters: Record<string, SourceAdapter>;
  listAccounts: (platform: Platform, country: string) => Promise<PanelAccount[]>;
  insertSnapshots: (snapshots: ContentSnapshot[]) => Promise<void>;
  upsertTrends: (source: Platform, trends: NormalizedTrend[]) => Promise<void>;
}

export interface RunRequest {
  source: string;
  country: string;
  period: Period;
}

export async function runEngine(deps: EngineDeps, req: RunRequest): Promise<void> {
  const adapter = deps.adapters[req.source];
  if (!adapter) throw new Error(`Unknown source: ${req.source}`);
  const ctx = { country: req.country, period: req.period };

  if (isClassA(adapter)) {
    const trends = await adapter.fetchTrends(ctx);
    await deps.upsertTrends(adapter.platform, trends);
    return;
  }

  // Class B: snapshot -> store -> derive -> upsert.
  const snapshots = await adapter.fetchSnapshots(ctx);
  await deps.insertSnapshots(snapshots);
  const accounts = await deps.listAccounts(adapter.platform, req.country);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const trends = derive(snapshots, accountsById, ctx);
  await deps.upsertTrends(adapter.platform, trends);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "feat(engine): runEngine orchestration for Class A/B"
```

---

### Task 9: CLI worker entrypoint

**Files:**
- Create: `engine/src/worker.ts`
- Test: `engine/src/worker.test.ts`

- [ ] **Step 1: Write the failing test `engine/src/worker.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseArgs, plannedRuns } from './worker.js';

describe('parseArgs', () => {
  it('parses flags with defaults (country=SE)', () => {
    const a = parseArgs(['--source=tiktok', '--period=week']);
    expect(a).toEqual({ source: 'tiktok', country: 'SE', period: 'week' });
  });
  it('throws when source is missing', () => {
    expect(() => parseArgs(['--period=week'])).toThrow(/--source/);
  });
});

describe('plannedRuns', () => {
  it('TikTok runs week+month (no day)', () => {
    expect(plannedRuns('tiktok', undefined)).toEqual(['week', 'month']);
  });
  it('Instagram runs day+week+month', () => {
    expect(plannedRuns('instagram', undefined)).toEqual(['day', 'week', 'month']);
  });
  it('honours an explicit --period', () => {
    expect(plannedRuns('instagram', 'day')).toEqual(['day']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/worker.test.ts`
Expected: FAIL — cannot find module `./worker.js`.

- [ ] **Step 3: Create `engine/src/worker.ts`**

```ts
import type { Period, Platform } from './adapters/contract.js';
import { loadEnv } from './config/env.js';
import { createSupabase } from './store/supabase.js';
import { createApify } from './store/apify.js';
import { listActiveAccounts } from './store/accounts.js';
import { insertSnapshots } from './store/snapshots.js';
import { upsertTrends } from './store/trends.js';
import { createTikTokAdapter } from './adapters/tiktok.js';
import { createInstagramAdapter } from './adapters/instagram.js';
import { runEngine, type EngineDeps } from './engine.js';

export interface ParsedArgs {
  source: string;
  country: string;
  period?: Period;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) flags[m[1]] = m[2];
  }
  if (!flags.source) throw new Error('Missing required flag --source=<tiktok|instagram>');
  return {
    source: flags.source,
    country: flags.country ?? 'SE',
    period: flags.period as Period | undefined,
  };
}

// Which period windows to run for a source when no explicit --period is given.
export function plannedRuns(source: string, period: Period | undefined): Period[] {
  if (period) return [period];
  return source === 'tiktok' ? ['week', 'month'] : ['day', 'week', 'month'];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadEnv();
  const supabase = createSupabase(cfg);
  const runActor = createApify(cfg.apifyToken);

  const adapters = {
    tiktok: createTikTokAdapter({ runActor, actorId: cfg.tiktokActorId }),
    instagram: createInstagramAdapter({
      runActor,
      actorId: cfg.instagramActorId,
      listAccounts: () => listActiveAccounts(supabase, 'instagram', args.country),
    }),
  };

  const deps: EngineDeps = {
    adapters,
    listAccounts: (platform: Platform, country: string) =>
      listActiveAccounts(supabase, platform, country),
    insertSnapshots: (s) => insertSnapshots(supabase, s),
    upsertTrends: (source, t) => upsertTrends(supabase, source, t),
  };

  for (const period of plannedRuns(args.source, args.period)) {
    console.log(`[worker] running ${args.source} country=${args.country} period=${period}`);
    await runEngine(deps, { source: args.source, country: args.country, period });
  }
  console.log('[worker] done');
}

// Only run main() when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((err) => {
    console.error('[worker] failed:', err);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run src/worker.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run full test suite + typecheck**

Run: `cd /c/Users/Ara/trend-analyzer/engine && npx vitest run && npx tsc --noEmit`
Expected: ALL tests PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "feat(worker): CLI entrypoint wiring real deps, cron-ready"
```

---

### Task 10: Database migration (pgvector + tables)

**Files:**
- Create: `engine/migrations/0001_init.sql`

- [ ] **Step 1: Create `engine/migrations/0001_init.sql`**

```sql
-- Trend engine schema. pgvector enabled now; clustering NOT implemented (v2).
create extension if not exists vector;

-- Industry lookup. 'all' is the sentinel for country-level (non-industry) trends.
create table if not exists industries (
  slug text primary key
);
insert into industries (slug) values
  ('all'), ('beauty'), ('fashion'), ('food'), ('fitness'), ('tech')
on conflict (slug) do nothing;

-- Curated panel (Class B). Instagram-only in v1; platform kept for future panels.
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  platform text not null check (platform in ('tiktok', 'instagram')),
  industry text not null references industries(slug),
  country text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (platform, handle)
);

-- Raw Class B measurements. embedding is reserved for v2 clustering (unused now).
create table if not exists content_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  platform text not null check (platform in ('tiktok', 'instagram')),
  external_id text not null,
  format text not null,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  audio_id text,
  captured_at timestamptz not null,
  metrics jsonb not null default '{}'::jsonb,
  embedding vector(1536)
);
create index if not exists content_snapshots_lookup
  on content_snapshots (platform, external_id, captured_at);

-- Unified trend store for both source classes.
create table if not exists trends (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_class text not null check (source_class in ('trend-feed', 'raw-content')),
  platform text not null check (platform in ('tiktok', 'instagram')),
  country text not null,
  industry text not null references industries(slug),
  format text not null,
  label text not null,
  period text not null check (period in ('day', 'week', 'month')),
  -- Class A native (nullable):
  rank int,
  rank_movement int,
  direction text check (direction in ('rising', 'falling', 'stable')),
  views bigint,
  -- Class B derived (nullable):
  velocity_score double precision,
  sample_size int,
  sample_window_days int,
  metrics jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (source, platform, country, industry, format, label, period)
);
create index if not exists trends_slice on trends (country, industry, format, period);
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "feat(db): initial migration — pgvector, accounts, snapshots, trends"
```

---

### Task 11: README + seed accounts

**Files:**
- Create: `engine/README.md`
- Create: `engine/migrations/0002_seed_accounts.sql`

- [ ] **Step 1: Create `engine/migrations/0002_seed_accounts.sql`** (placeholder panel — edit in DB)

```sql
-- Placeholder curated SE Instagram panel. Replace handles with real accounts.
insert into accounts (handle, platform, industry, country) values
  ('example_beauty_se', 'instagram', 'beauty', 'SE'),
  ('example_fashion_se', 'instagram', 'fashion', 'SE'),
  ('example_food_se', 'instagram', 'food', 'SE')
on conflict (platform, handle) do nothing;
```

- [ ] **Step 2: Create `engine/README.md`**

````markdown
# Trend Engine

Backend engine that surfaces social-media trends for a country (start: Sweden / `SE`),
sliced by industry and content format over day/week/month windows, into Supabase.

## Architecture

Two source classes feed one `trends` table through a shared adapter contract
(`src/adapters/contract.ts`). **Adding a source is one new file in `src/adapters/`.**

- **Class A (`trend-feed`)** — platform provides pre-computed trends, mapped straight in.
  - **TikTok** via Apify Creative Center (`automation-lab/tiktok-trends-scraper`,
    swappable via `TIKTOK_ACTOR_ID`). Trending **sounds** are stored country-level
    (`industry = 'all'`); **hashtags** are stored per industry (the only category TikTok
    exposes an industry filter for). Windows: week (7d), month (30d). No native day.
- **Class B (`raw-content`)** — no native trend surface; the engine derives trends from
  engagement velocity.
  - **Instagram** via `apify/instagram-reel-scraper` over a curated panel of SE accounts
    (the `accounts` table). Windows: day, week, month.

### Facebook / Meta (out of scope)

Facebook is **not** ingested in this build. The future Class A feed for Meta is the **Ad
Library** (`apify/facebook-ads-scraper`) — **not** the posts scraper. When added, it slots
in as one more Class A adapter file.

## Setup

```bash
cd engine
cp .env.example .env   # fill in Supabase + Apify credentials
npm install
```

Apply migrations (`migrations/0001_init.sql`, then `0002_seed_accounts.sql`) to your
Supabase project, then edit the `accounts` table to set your real curated panel.

The `SUPABASE_SERVICE_ROLE_KEY` is **server-side only** — never ship it to a browser /
the future Next.js app, which should use the anon key + RLS.

## Run

```bash
npm run worker -- --source=tiktok --country=SE            # week + month
npm run worker -- --source=instagram --country=SE         # day + week + month
npm run worker -- --source=instagram --country=SE --period=day
```

The worker is a stateless CLI — drop it into cron or a Supabase scheduled function for
periodic polling. Class B needs ≥2 snapshots of an item before a trend is derivable
(cold start); longer windows (month) need correspondingly more history.

## Test

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
```

## v2 (not implemented)

pgvector is enabled and `content_snapshots.embedding` exists, but no clustering logic is
built yet.
````

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Ara/trend-analyzer && git add -A && git commit -m "docs: README + seed accounts placeholder"
```

---

## Self-Review

**Spec coverage:**
- Two source classes + shared contract → Tasks 2, 6, 7, 8 ✓
- "Adding a source is one new file" → adapter factory pattern, Task 2/6/7 ✓
- TikTok Class A Creative Center, sounds country-level + hashtags per industry → Task 7 ✓
- Instagram Class B velocity → Tasks 3, 6 ✓
- Facebook note (Ad Library = future Class A) → Task 11 README ✓
- day/week/month, TikTok week+month only → Tasks 7 (`periodToDays`), 9 (`plannedRuns`) ✓
- Unified `trends` table, `'all'` sentinel, idempotent upsert → Tasks 4, 10 ✓
- pgvector enabled, no clustering → Task 10 ✓
- Node20/TS/ESM/tsx, Supabase service-role server-side, apify-client → Tasks 0, 4, 5 ✓
- Single cron-ready worker entrypoint → Task 9 ✓
- DB-driven accounts panel → Tasks 4, 10, 11 ✓
- env placeholders, swappable TikTok actor → Tasks 0, 1 ✓

**Placeholder scan:** No TBDs. Apify field-name notes are explicit "confirm against docs" callouts scoped to the mapper functions, with concrete default mappings provided — not unfilled blanks.

**Type consistency:** `NormalizedTrend`, `ContentSnapshot`, `PanelAccount`, `ActorRunner`, `RunContext`, `Period`, `Industry`, `SupabaseLike` are defined once (Tasks 1–2) and reused with identical names/signatures across Tasks 3–11. `derive(snapshots, accountsById, ctx, opts?)`, `upsertTrends(client, source, trends)`, `insertSnapshots(client, snapshots)`, `listActiveAccounts(client, platform, country)`, `periodToDays`, `periodWindowDays`, `plannedRuns`, `parseArgs` signatures are consistent between their definition and call sites.
